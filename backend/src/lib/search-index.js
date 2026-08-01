function searchDocumentId(documentType, documentId) {
  return `${documentType}:${documentId}`
}

const MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE = 'meeting_transcript_segment'

function extractFileExtension(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0 || lastDot >= trimmed.length - 1) return null
  return trimmed.slice(lastDot + 1).toLowerCase()
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

function normalizeTranscriptSegment(value) {
  if (!value || typeof value !== 'object') return null

  const speakerUserId = typeof value.speaker_user_id === 'string'
    ? value.speaker_user_id.trim()
    : ''
  const speakerLabel = typeof value.speaker_label === 'string'
    ? value.speaker_label.trim()
    : ''
  const text = typeof value.text === 'string'
    ? value.text.trim()
    : ''
  const startMs = Number(value.start_ms)
  const endMs = Number(value.end_ms)

  if (!speakerUserId || !speakerLabel || !text || !Number.isFinite(startMs) || startMs < 0) {
    return null
  }

  return {
    speakerUserId,
    speakerLabel,
    text,
    startMs: Math.round(startMs),
    endMs: Number.isFinite(endMs) && endMs >= startMs
      ? Math.round(endMs)
      : null
  }
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

function resolveTranscriptSegmentTimestamp(meetingStartedAt, segmentStartMs, fallbackTimestamp) {
  if (typeof meetingStartedAt === 'string' && meetingStartedAt.trim() && Number.isFinite(segmentStartMs)) {
    const meetingStartTimestamp = Date.parse(meetingStartedAt)
    if (Number.isFinite(meetingStartTimestamp)) {
      return new Date(meetingStartTimestamp + segmentStartMs).toISOString()
    }
  }

  return fallbackTimestamp
}

function buildTranscriptSegmentSearchDocuments(artifact, meetingTimestamp) {
  if (artifact.artifact_type !== 'transcript' || !artifact.payload || !Array.isArray(artifact.payload.segments)) {
    return []
  }

  const title = normalizeArtifactTitle(artifact.artifact_type, artifact.meeting_title)

  return artifact.payload.segments
    .map((segment, index) => {
      const normalized = normalizeTranscriptSegment(segment)
      if (!normalized) return null

      const segmentDocumentId = `${artifact.id}:${index}`
      const segmentTimestamp = resolveTranscriptSegmentTimestamp(
        artifact.meeting_started_at,
        normalized.startMs,
        meetingTimestamp
      )

      return {
        id: searchDocumentId(MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE, segmentDocumentId),
        document_type: MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE,
        document_id: segmentDocumentId,
        source_channel_id: artifact.source_channel_id || null,
        source_message_id: null,
        source_meeting_id: artifact.meeting_id,
        owner_user_id: null,
        author_user_id: normalized.speakerUserId,
        title,
        content_text: normalized.text,
        file_name: null,
        file_extension: null,
        mime_type: null,
        metadata: {
          artifact_type: artifact.artifact_type,
          author_display_name: normalized.speakerLabel,
          channel_name: artifact.channel_name || null,
          channel_type: artifact.channel_type || null,
          channel_purpose: artifact.channel_purpose || null,
          meeting_title: artifact.meeting_title || null,
          meeting_chat_channel_id: artifact.chat_channel_id || null,
          meeting_chat_channel_name: artifact.meeting_chat_channel_name || null,
          transcript_artifact_id: artifact.id,
          transcript_start_ms: normalized.startMs,
          transcript_end_ms: normalized.endMs,
          meeting_started_at: artifact.meeting_started_at || null,
          meeting_ended_at: artifact.meeting_ended_at || null,
          navigation_target: `/meetings/${encodeURIComponent(artifact.meeting_id)}?transcript_start_ms=${encodeURIComponent(normalized.startMs)}`
        },
        embedding_model: null,
        created_at: segmentTimestamp,
        updated_at: segmentTimestamp
      }
    })
    .filter(Boolean)
}

async function removeByDocument(db, documentType, documentId) {
  await db('search_documents')
    .where({
      document_type: documentType,
      document_id: documentId
    })
    .del()
}

async function removeTranscriptSegmentSearchDocuments(db, transcriptArtifactId) {
  await db('search_documents')
    .whereRaw(
      "document_type = ? AND COALESCE(metadata->>'transcript_artifact_id', '') = ?",
      [MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE, transcriptArtifactId]
    )
    .del()
}

async function upsertSearchDocuments(db, payloads) {
  for (const payload of payloads) {
    await db('search_documents')
      .insert(payload)
      .onConflict(['document_type', 'document_id'])
      .merge(payload)
  }
}

export async function removeSearchDocument(db, { documentType, documentId }) {
  if (documentType === 'meeting_transcript') {
    await removeTranscriptSegmentSearchDocuments(db, documentId)
  }
  await removeByDocument(db, documentType, documentId)
}

export async function removeMessageSearchDocuments(db, messageId) {
  await db('search_documents')
    .where('source_message_id', messageId)
    .orWhere({
      document_type: 'message',
      document_id: messageId
    })
    .del()
}

export async function upsertMessageSearchDocument(db, messageId) {
  const message = await db('messages as m')
    .leftJoin('users as u', 'u.id', 'm.user_id')
    .leftJoin('channels as c', 'c.id', 'm.channel_id')
    .leftJoin('meetings as meeting', 'meeting.chat_channel_id', 'm.channel_id')
    .where('m.id', messageId)
    .select(
      'm.id',
      'm.channel_id',
      'm.user_id',
      'm.created_at',
      'm.updated_at',
      'm.content',
      'm.type',
      'm.deleted_at',
      'c.name as channel_name',
      'c.type as channel_type',
      'c.purpose as channel_purpose',
      'u.display_name as author_display_name',
      'meeting.id as meeting_id',
      'meeting.title as meeting_title',
      'meeting.chat_channel_id as meeting_chat_channel_id'
    )
    .first()

  const hasContent = typeof message?.content === 'string' && message.content.trim().length > 0
  if (!message || message.deleted_at || message.type === 'system' || !hasContent) {
    await removeByDocument(db, 'message', messageId)
    return
  }

  const payload = {
    id: searchDocumentId('message', message.id),
    document_type: 'message',
    document_id: message.id,
    source_channel_id: message.channel_id,
    source_message_id: message.id,
    source_meeting_id: message.meeting_id || null,
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
      navigation_target: message.meeting_id
        ? `/meetings/${encodeURIComponent(message.meeting_id)}?message=${encodeURIComponent(message.id)}`
        : `/channels/${encodeURIComponent(message.channel_id)}?message=${encodeURIComponent(message.id)}`
    },
    embedding_model: null,
    created_at: message.created_at,
    updated_at: message.updated_at || message.created_at
  }

  await db('search_documents')
    .insert(payload)
    .onConflict(['document_type', 'document_id'])
    .merge(payload)
}

export async function upsertFileSearchDocument(db, fileId) {
  const file = await db('files as f')
    .leftJoin('messages as m', 'm.id', 'f.message_id')
    .leftJoin('channels as c', 'c.id', 'm.channel_id')
    .leftJoin('users as u', 'u.id', 'f.user_id')
    .where('f.id', fileId)
    .select(
      'f.id',
      'f.message_id',
      'f.user_id',
      'f.original_name',
      'f.mime_type',
      'f.size',
      'f.created_at',
      'f.updated_at',
      'm.id as linked_message_id',
      'm.channel_id',
      'm.content as message_content',
      'm.deleted_at as message_deleted_at',
      'c.name as channel_name',
      'c.type as channel_type',
      'c.purpose as channel_purpose',
      'u.display_name as author_display_name'
    )
    .first()

  if (!file || !file.linked_message_id || file.message_deleted_at) {
    await removeByDocument(db, 'file', fileId)
    return
  }

  const payload = {
    id: searchDocumentId('file', file.id),
    document_type: 'file',
    document_id: file.id,
    source_channel_id: file.channel_id,
    source_message_id: file.message_id,
    source_meeting_id: null,
    owner_user_id: null,
    author_user_id: file.user_id,
    title: file.original_name,
    content_text: file.message_content || null,
    file_name: file.original_name,
    file_extension: extractFileExtension(file.original_name),
    mime_type: file.mime_type,
    metadata: {
      author_display_name: file.author_display_name || null,
      channel_name: file.channel_name || null,
      channel_type: file.channel_type || null,
      channel_purpose: file.channel_purpose || null,
      navigation_target: `/channels/${encodeURIComponent(file.channel_id)}?message=${encodeURIComponent(file.message_id)}`,
      size: file.size
    },
    embedding_model: null,
    created_at: file.created_at,
    updated_at: file.updated_at || file.created_at
  }

  await db('search_documents')
    .insert(payload)
    .onConflict(['document_type', 'document_id'])
    .merge(payload)
}

export async function removeFileSearchDocument(db, fileId) {
  await removeByDocument(db, 'file', fileId)
}

export async function upsertMeetingArtifactSearchDocument(db, artifactId) {
  const artifact = await db('meeting_artifacts as artifact')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
    .leftJoin('channels as chat_channel', 'chat_channel.id', 'meeting.chat_channel_id')
    .leftJoin('users as host_user', 'host_user.id', 'meeting.host_user_id')
    .where('artifact.id', artifactId)
    .select(
      'artifact.id',
      'artifact.meeting_id',
      'artifact.artifact_type',
      'artifact.status',
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
    .first()

  if (!artifact) return

  const documentType = `meeting_${artifact.artifact_type}`
  const isTranscriptArtifact = artifact.artifact_type === 'transcript'

  if (isTranscriptArtifact) {
    await removeTranscriptSegmentSearchDocuments(db, artifact.id)
  }

  const contentText = artifact.status === 'ready'
    ? extractArtifactContent(artifact.payload, artifact.artifact_type)
    : null

  if (!contentText) {
    await removeByDocument(db, documentType, artifactId)
    return
  }

  const meetingTimestamp = resolveMeetingArtifactTimestamp(artifact)
  const speakerUserIds = artifact.artifact_type === 'transcript'
    ? extractSpeakerUserIds(artifact.payload)
    : []

  const payload = {
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

  const payloads = [
    payload,
    ...buildTranscriptSegmentSearchDocuments(artifact, meetingTimestamp)
  ]

  await upsertSearchDocuments(db, payloads)
}

export function getSearchDocumentId(documentType, documentId) {
  return searchDocumentId(documentType, documentId)
}

export function getFileExtension(name) {
  return extractFileExtension(name)
}

export function getArtifactSearchContent(payload, artifactType) {
  return extractArtifactContent(payload, artifactType)
}

export function getArtifactSpeakerUserIds(payload) {
  return extractSpeakerUserIds(payload)
}
