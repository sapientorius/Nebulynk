import {
  MEETING_RECORDING_STATUS,
  isActiveMeetingRecordingStatus
} from '../../lib/meeting-recordings.js'

export const TRANSCRIPTION_RECORDING_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused'
}

export function normalizeTranscriptionRecordingStatus(value) {
  return value === TRANSCRIPTION_RECORDING_STATUS.PAUSED
    ? TRANSCRIPTION_RECORDING_STATUS.PAUSED
    : TRANSCRIPTION_RECORDING_STATUS.ACTIVE
}

export function createRecordingStats(recordings = []) {
  const stats = {
    total_count: recordings.length,
    active_count: 0,
    pending_count: 0,
    recording_count: 0,
    ending_count: 0
  }

  for (const recording of recordings) {
    if (!isActiveMeetingRecordingStatus(recording.status)) continue
    stats.active_count += 1
    if (recording.status === MEETING_RECORDING_STATUS.PENDING) stats.pending_count += 1
    if (recording.status === MEETING_RECORDING_STATUS.RECORDING) stats.recording_count += 1
    if (recording.status === MEETING_RECORDING_STATUS.ENDING) stats.ending_count += 1
  }

  return stats
}

export function buildTranscriptionRecordingState({
  meeting,
  stats = createRecordingStats(),
  viewerUser = null,
  runtimeAvailable = false
}) {
  const persistedStatus = normalizeTranscriptionRecordingStatus(meeting?.transcription_recording_status)
  const isActiveMeeting = meeting?.status === 'active'
  const isPaused = isActiveMeeting && persistedStatus === TRANSCRIPTION_RECORDING_STATUS.PAUSED
  const canControl = isActiveMeeting && !!viewerUser && (
    viewerUser.is_admin === true || meeting.host_user_id === viewerUser.id
  )
  const visible = isActiveMeeting && (runtimeAvailable || stats.total_count > 0 || isPaused)

  let status = 'unavailable'
  if (visible) {
    if (isPaused) {
      status = 'paused'
    } else if (stats.recording_count > 0) {
      status = 'recording'
    } else if (stats.pending_count > 0 || stats.ending_count > 0) {
      status = 'starting'
    } else {
      status = 'idle'
    }
  }

  return {
    visible,
    status,
    paused_at: isPaused ? meeting.transcription_recording_paused_at || null : null,
    paused_by: isPaused ? meeting.transcription_recording_paused_by || null : null,
    active_recording_count: stats.active_count,
    pending_recording_count: stats.pending_count,
    recording_count: stats.recording_count,
    can_pause: visible && canControl && !isPaused,
    can_resume: visible && canControl && isPaused
  }
}

function hasArtifactPayload(artifact) {
  return artifact?.payload !== null && artifact?.payload !== undefined
}

function isInactiveLegacyMeetingArtifact(artifact) {
  return (
    (artifact?.artifact_type === 'summary' || artifact?.artifact_type === 'actions')
    && artifact?.status === 'pending'
    && !hasArtifactPayload(artifact)
  )
}

export function filterVisibleMeetingArtifacts(artifacts = []) {
  return (artifacts || []).filter((artifact) => !isInactiveLegacyMeetingArtifact(artifact))
}

export function buildSummaryGenerationState({
  meeting,
  summaryArtifact = null,
  viewerUser = null,
  manualRuntimeAvailable = false
}) {
  if (meeting?.status !== 'ended') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'not_ended'
    }
  }

  if (summaryArtifact?.status === 'processing' || summaryArtifact?.status === 'pending') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'processing'
    }
  }

  if (summaryArtifact?.status === 'ready') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'ready'
    }
  }

  const viewerCanRetry = !!viewerUser && (
    viewerUser.is_admin === true || meeting.host_user_id === viewerUser.id
  )

  if (summaryArtifact?.status === 'failed') {
    return {
      available: manualRuntimeAvailable,
      allowed: manualRuntimeAvailable && viewerCanRetry,
      action: 'retry',
      reason: manualRuntimeAvailable
        ? (viewerCanRetry ? null : 'retry_forbidden')
        : 'missing_runtime'
    }
  }

  return {
    available: manualRuntimeAvailable,
    allowed: manualRuntimeAvailable && !!viewerUser,
    action: 'generate',
    reason: manualRuntimeAvailable ? null : 'missing_runtime'
  }
}

export function isRetryableTranscriptRecording(recording) {
  if (!recording?.storage_bucket || !recording?.storage_key) {
    return false
  }

  if (recording.status === MEETING_RECORDING_STATUS.READY) {
    return true
  }

  return recording.status === MEETING_RECORDING_STATUS.FAILED
    && recording.failure_code === 'transcription_failed'
}

export function isDownloadableMeetingRecording(recording) {
  if (!recording?.storage_bucket || !recording?.storage_key) {
    return false
  }

  return recording.status === MEETING_RECORDING_STATUS.READY
    || recording.status === MEETING_RECORDING_STATUS.COMPLETED
}

export function isRegeneratableTranscriptRecording(recording) {
  return isDownloadableMeetingRecording(recording) || isRetryableTranscriptRecording(recording)
}

export function buildTranscriptGenerationState({
  meeting,
  transcriptArtifact = null,
  viewerUser = null,
  transcriptionRuntimeAvailable = false,
  retryableRecordingCount = 0
}) {
  if (meeting?.status !== 'ended') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'not_ended'
    }
  }

  if (transcriptArtifact?.status === 'processing' || transcriptArtifact?.status === 'pending') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'processing'
    }
  }

  if (transcriptArtifact?.status === 'ready') {
    return {
      available: false,
      allowed: false,
      action: null,
      reason: 'ready'
    }
  }

  const viewerCanRetry = !!viewerUser && (
    viewerUser.is_admin === true || meeting.host_user_id === viewerUser.id
  )

  if (transcriptArtifact?.status === 'failed') {
    if (!viewerCanRetry) {
      return {
        available: transcriptionRuntimeAvailable && retryableRecordingCount > 0,
        allowed: false,
        action: 'retry',
        reason: 'retry_forbidden'
      }
    }

    return {
      available: transcriptionRuntimeAvailable && retryableRecordingCount > 0,
      allowed: transcriptionRuntimeAvailable && retryableRecordingCount > 0,
      action: 'retry',
      reason: !transcriptionRuntimeAvailable
        ? 'missing_runtime'
        : retryableRecordingCount === 0
          ? 'no_retryable_recordings'
          : null
    }
  }

  return {
    available: false,
    allowed: false,
    action: null,
    reason: 'no_retryable_recordings'
  }
}

export function buildAdminArtifactMenuState({
  meeting,
  summaryArtifact = null,
  transcriptArtifact = null,
  viewerUser = null,
  downloadableRecordingCount = 0
}) {
  const isAdmin = viewerUser?.is_admin === true
  const visible = isAdmin
    && meeting?.status === 'ended'
    && summaryArtifact?.status === 'ready'
    && transcriptArtifact?.status === 'ready'
    && downloadableRecordingCount > 0

  return {
    visible,
    can_regenerate_transcript: visible,
    can_regenerate_summary: visible,
    can_download_audio: visible
  }
}
