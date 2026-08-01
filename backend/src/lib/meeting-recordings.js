import { createId } from '@paralleldrive/cuid2'
import { decryptSecret } from './ai-secrets.js'

export const MEETING_RECORDING_STATUS = {
  PENDING: 'pending',
  RECORDING: 'recording',
  ENDING: 'ending',
  READY: 'ready',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

export const TERMINAL_MEETING_RECORDING_STATUSES = new Set([
  MEETING_RECORDING_STATUS.READY,
  MEETING_RECORDING_STATUS.COMPLETED,
  MEETING_RECORDING_STATUS.FAILED
])

export const ACTIVE_MEETING_RECORDING_STATUSES = new Set([
  MEETING_RECORDING_STATUS.PENDING,
  MEETING_RECORDING_STATUS.RECORDING,
  MEETING_RECORDING_STATUS.ENDING
])

export const MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS = Number(
  process.env.MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS || 1_800_000
)

export function isTerminalMeetingRecordingStatus(status) {
  return TERMINAL_MEETING_RECORDING_STATUSES.has(status)
}

export function isActiveMeetingRecordingStatus(status) {
  return ACTIVE_MEETING_RECORDING_STATUSES.has(status)
}

export function getMeetingRecordingPrefix(meetingId) {
  const configuredPrefix = typeof process.env.MEETING_RECORDINGS_PREFIX === 'string'
    ? process.env.MEETING_RECORDINGS_PREFIX.trim().replace(/^\/+|\/+$/g, '')
    : ''
  const basePrefix = configuredPrefix || 'meeting-recordings'
  return `${basePrefix}/${meetingId}`
}

export function buildMeetingRecordingKey({ meetingId, userId, recordingId }) {
  const normalizedUserId = typeof userId === 'string' && userId.trim()
    ? userId.trim()
    : 'unknown-user'
  return `${getMeetingRecordingPrefix(meetingId)}/${normalizedUserId}/${recordingId}.mp4`
}

export function parseStorageObjectKey(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    const pathname = parsed.pathname || ''
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length >= 2) {
      return segments.slice(1).join('/')
    }
  } catch {
    // `value` may already be an object key.
  }

  return trimmed.replace(/^\/+/, '')
}

export function getRecordingSpeakerLabel(recording) {
  if (typeof recording?.participant_display_name === 'string' && recording.participant_display_name.trim()) {
    return recording.participant_display_name.trim()
  }
  if (typeof recording?.participant_identity === 'string' && recording.participant_identity.trim()) {
    return recording.participant_identity.trim()
  }
  if (typeof recording?.user_id === 'string' && recording.user_id.trim()) {
    return recording.user_id.trim()
  }
  return 'Unknown speaker'
}

export function createMeetingRecordingRow({
  meetingId,
  userId = null,
  participantIdentity,
  participantDisplayName = null,
  bucket,
  key
}) {
  const nowIso = new Date().toISOString()
  const id = createId()

  return {
    id,
    meeting_id: meetingId,
    user_id: userId || null,
    participant_identity: participantIdentity,
    participant_display_name: participantDisplayName || null,
    status: MEETING_RECORDING_STATUS.PENDING,
    livekit_egress_id: null,
    storage_bucket: bucket,
    storage_key: key || buildMeetingRecordingKey({
      meetingId,
      userId,
      recordingId: id
    }),
    mime_type: 'video/mp4',
    duration_ms: null,
    started_at: null,
    ended_at: null,
    failure_code: null,
    failure_message: null,
    created_at: nowIso,
    updated_at: nowIso
  }
}

export async function getActiveTranscriptionRuntime(db, app) {
  return getActiveAiRuntime(db, app, 'transcription')
}

export async function getActiveMeetingSummaryRuntime(db, app) {
  return getActiveAiRuntime(db, app, 'meeting_summary')
}

export async function getActiveChatSummaryRuntime(db, app) {
  return getActiveAiRuntime(db, app, 'chat_summary')
}

export async function getActiveImageGenerationRuntime(db, app) {
  return getActiveAiRuntime(db, app, 'image_generation')
}

export async function getManualMeetingSummaryRuntime(db, app) {
  return getAiRuntime(db, app, 'meeting_summary', { enabledOnly: false })
}

async function getActiveAiRuntime(db, app, functionKey) {
  return getAiRuntime(db, app, functionKey, { enabledOnly: true })
}

async function getAiRuntime(db, app, functionKey, { enabledOnly = true } = {}) {
  let query = db('ai_function_configs')
    .where('function_key', functionKey)
    .whereNotNull('provider_instance_id')
    .whereNotNull('model')

  if (enabledOnly) {
    query = query.where('enabled', true)
  }

  const functionConfig = await query.first()

  if (!functionConfig) {
    return null
  }

  const providerInstance = await db('ai_provider_instances')
    .where('id', functionConfig.provider_instance_id)
    .first()

  if (!providerInstance || providerInstance.enabled !== true) {
    return null
  }

  const providerSecret = await db('ai_provider_secrets')
    .where('provider_instance_id', providerInstance.id)
    .first()

  if (!providerSecret) {
    return null
  }

  return {
    functionConfig,
    providerInstance,
    apiKey: decryptSecret(app, providerSecret.encrypted_secret)
  }
}
