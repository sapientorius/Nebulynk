const SEARCH_DOCUMENTS_TABLE = 'search_documents'
const CHUNK_SIZE = 250

function searchDocumentId(documentType, documentId) {
  return `${documentType}:${documentId}`
}

function normalizeArtifactTitle(artifactType, meetingTitle) {
  const labels = {
    transcript: 'Meeting transcript',
    summary: 'Meeting summary',
    actions: 'Meeting actions'
  }
  const base = labels[artifactType] || 'Meeting artifact'
  return meetingTitle ? `${base}: ${meetingTitle}` : base
}

function extractSpeakerUserIds(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.segments)) {
    return []
  }

  return [...new Set(payload.segments
    .map((segment) => (
      segment && typeof segment.speaker_user_id === 'string'
        ? segment.speaker_user_id.trim()
        : ''
    ))
    .filter(Boolean))]
}

function extractArtifactContent(payload, artifactType) {
  if (!payload || typeof payload !== 'object') return null

  if (artifactType === 'actions' && Array.isArray(payload.actions)) {
    const lines = payload.actions
      .map((action) => {
        if (!action || typeof action !== 'object') return null
        const parts = [
          action.title,
          action.summary,
          action.description,
          action.owner_name,
          action.due_date
        ].filter(Boolean)
        return parts.join(' - ')
      })
      .filter(Boolean)
    return lines.length > 0 ? lines.join('\n') : null
  }

  const stringKeys = ['text', 'summary', 'content', 'markdown', 'transcript', 'description']
  for (const key of stringKeys) {
    if (typeof payload[key] === 'string' && payload[key].trim()) {
      return payload[key].trim()
    }
  }

  if (Array.isArray(payload.segments)) {
    const lines = payload.segments
      .map((segment) => {
        if (typeof segment === 'string') return segment.trim()
        if (segment && typeof segment.text === 'string') return segment.text.trim()
        return null
      })
      .filter(Boolean)
    return lines.length > 0 ? lines.join('\n') : null
  }

  return null
}

function resolveMeetingArtifactTimestamp(artifact) {
  return artifact.meeting_ended_at
    || artifact.meeting_started_at
    || artifact.meeting_scheduled_start_at
    || artifact.updated_at
    || artifact.created_at
}

async function upsertRows(knex, rows) {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE)
    if (chunk.length === 0) continue
    await knex(SEARCH_DOCUMENTS_TABLE)
      .insert(chunk)
      .onConflict(['document_type', 'document_id'])
      .merge()
  }
}

export async function up(knex) {
  const hasSearchDocumentsTable = await knex.schema.hasTable(SEARCH_DOCUMENTS_TABLE)
  if (!hasSearchDocumentsTable) return

  const meetingMessages = await knex('messages as m')
    .leftJoin('users as u', 'u.id', 'm.user_id')
    .leftJoin('channels as c', 'c.id', 'm.channel_id')
    .join('meetings as meeting', 'meeting.chat_channel_id', 'm.channel_id')
    .whereNull('m.deleted_at')
    .where('m.type', '<>', 'system')
    .whereRaw("NULLIF(BTRIM(COALESCE(m.content, '')), '') IS NOT NULL")
    .select(
      'm.id',
      'm.channel_id',
      'm.user_id',
      'm.created_at',
      'm.updated_at',
      'm.content',
      'c.name as channel_name',
      'c.type as channel_type',
      'c.purpose as channel_purpose',
      'u.display_name as author_display_name',
      'meeting.id as meeting_id',
      'meeting.title as meeting_title',
      'meeting.chat_channel_id as meeting_chat_channel_id'
    )

  await upsertRows(knex, meetingMessages.map((message) => ({
    id: searchDocumentId('message', message.id),
    document_type: 'message',
    document_id: message.id,
    source_channel_id: message.channel_id,
    source_message_id: message.id,
    source_meeting_id: message.meeting_id,
    owner_user_id: null,
    author_user_id: message.user_id,
    title: null,
    content_text: message.content,
    file_name: null,
    file_extension: null,
    mime_type: null,
    metadata: {
      channel_name: message.channel_name || null,
      channel_type: message.channel_type || null,
      channel_purpose: message.channel_purpose || null,
      author_display_name: message.author_display_name || null,
      meeting_title: message.meeting_title || null,
      meeting_chat_channel_id: message.meeting_chat_channel_id || null,
      navigation_target: `/meetings/${encodeURIComponent(message.meeting_id)}?message=${encodeURIComponent(message.id)}`
    },
    embedding_model: null,
    created_at: message.created_at,
    updated_at: message.updated_at || message.created_at
  })))

  const artifacts = await knex('meeting_artifacts as artifact')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
    .leftJoin('channels as chat_channel', 'chat_channel.id', 'meeting.chat_channel_id')
    .leftJoin('users as host_user', 'host_user.id', 'meeting.host_user_id')
    .whereNotNull('artifact.payload')
    .where('artifact.status', 'ready')
    .select(
      'artifact.id',
      'artifact.meeting_id',
      'artifact.artifact_type',
      'artifact.payload',
      'artifact.created_at',
      'artifact.updated_at',
      'meeting.title as meeting_title',
      'meeting.chat_channel_id',
      'meeting.started_at as meeting_started_at',
      'meeting.ended_at as meeting_ended_at',
      'meeting.scheduled_start_at as meeting_scheduled_start_at',
      'meeting.source_channel_id',
      'meeting.host_user_id',
      'source_channel.name as channel_name',
      'source_channel.type as channel_type',
      'source_channel.purpose as channel_purpose',
      'chat_channel.name as meeting_chat_channel_name',
      'host_user.display_name as author_display_name'
    )

  const artifactDocuments = artifacts
    .map((artifact) => {
      const documentType = `meeting_${artifact.artifact_type}`
      const contentText = extractArtifactContent(artifact.payload, artifact.artifact_type)
      if (!contentText) return null

      const speakerUserIds = artifact.artifact_type === 'transcript'
        ? extractSpeakerUserIds(artifact.payload)
        : []
      const meetingTimestamp = resolveMeetingArtifactTimestamp(artifact)

      return {
        id: searchDocumentId(documentType, artifact.id),
        document_type: documentType,
        document_id: artifact.id,
        source_channel_id: artifact.source_channel_id || null,
        source_message_id: null,
        source_meeting_id: artifact.meeting_id,
        owner_user_id: null,
        author_user_id: artifact.host_user_id || null,
        title: normalizeArtifactTitle(artifact.artifact_type, artifact.meeting_title),
        content_text: contentText,
        file_name: null,
        file_extension: null,
        mime_type: null,
        metadata: {
          artifact_type: artifact.artifact_type,
          author_display_name: artifact.author_display_name || null,
          channel_name: artifact.channel_name || null,
          channel_type: artifact.channel_type || null,
          channel_purpose: artifact.channel_purpose || null,
          meeting_title: artifact.meeting_title || null,
          meeting_chat_channel_id: artifact.chat_channel_id || null,
          meeting_chat_channel_name: artifact.meeting_chat_channel_name || null,
          speaker_user_ids: speakerUserIds,
          meeting_started_at: artifact.meeting_started_at || null,
          meeting_ended_at: artifact.meeting_ended_at || null,
          navigation_target: `/meetings/${encodeURIComponent(artifact.meeting_id)}`
        },
        embedding_model: null,
        created_at: meetingTimestamp,
        updated_at: meetingTimestamp
      }
    })
    .filter(Boolean)

  await upsertRows(knex, artifactDocuments)
}

export async function down() {}
