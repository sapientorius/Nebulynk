const SEARCH_DOCUMENTS_TABLE = 'search_documents'
const MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE = 'meeting_transcript_segment'
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

function buildTranscriptSegmentDocuments(artifact) {
  const meetingTimestamp = resolveMeetingArtifactTimestamp(artifact)
  const title = normalizeArtifactTitle('transcript', artifact.meeting_title)
  const segments = Array.isArray(artifact.payload?.segments) ? artifact.payload.segments : []

  return segments
    .map((segment, index) => {
      const normalized = normalizeTranscriptSegment(segment)
      if (!normalized) return null

      const documentId = `${artifact.id}:${index}`
      const segmentTimestamp = resolveTranscriptSegmentTimestamp(
        artifact.meeting_started_at,
        normalized.startMs,
        meetingTimestamp
      )

      return {
        id: searchDocumentId(MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE, documentId),
        document_type: MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE,
        document_id: documentId,
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
          artifact_type: 'transcript',
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

  await knex(SEARCH_DOCUMENTS_TABLE)
    .where('document_type', MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE)
    .del()

  const artifacts = await knex('meeting_artifacts as artifact')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
    .leftJoin('channels as chat_channel', 'chat_channel.id', 'meeting.chat_channel_id')
    .leftJoin('users as host_user', 'host_user.id', 'meeting.host_user_id')
    .where('artifact.artifact_type', 'transcript')
    .where('artifact.status', 'ready')
    .whereNotNull('artifact.payload')
    .select(
      'artifact.id',
      'artifact.meeting_id',
      'artifact.payload',
      'artifact.created_at',
      'artifact.updated_at',
      'meeting.title as meeting_title',
      'meeting.chat_channel_id',
      'meeting.started_at as meeting_started_at',
      'meeting.ended_at as meeting_ended_at',
      'meeting.scheduled_start_at as meeting_scheduled_start_at',
      'meeting.source_channel_id',
      'source_channel.name as channel_name',
      'source_channel.type as channel_type',
      'source_channel.purpose as channel_purpose',
      'chat_channel.name as meeting_chat_channel_name',
      'host_user.display_name as author_display_name'
    )

  const segmentDocuments = artifacts.flatMap((artifact) => buildTranscriptSegmentDocuments(artifact))
  await upsertRows(knex, segmentDocuments)
}

export async function down(knex) {
  const hasSearchDocumentsTable = await knex.schema.hasTable(SEARCH_DOCUMENTS_TABLE)
  if (!hasSearchDocumentsTable) return

  await knex(SEARCH_DOCUMENTS_TABLE)
    .where('document_type', MEETING_TRANSCRIPT_SEGMENT_DOCUMENT_TYPE)
    .del()
}
