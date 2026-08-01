import test from 'node:test'
import assert from 'node:assert/strict'
import { MEETING_RECORDING_STATUS } from '../src/lib/meeting-recordings.js'
import {
  buildAdminArtifactMenuState,
  buildSummaryGenerationState,
  buildTranscriptGenerationState,
  buildTranscriptionRecordingState,
  createRecordingStats,
  filterVisibleMeetingArtifacts,
  isDownloadableMeetingRecording,
  isRegeneratableTranscriptRecording,
  isRetryableTranscriptRecording
} from '../src/domains/meetings/artifact-state.js'

test('meetings artifact state: recording state reflects active, paused, and unavailable states', () => {
  const activeMeeting = {
    id: 'meeting-1',
    status: 'active',
    host_user_id: 'host-1',
    transcription_recording_status: 'active',
    transcription_recording_paused_at: null,
    transcription_recording_paused_by: null
  }

  assert.deepEqual(
    buildTranscriptionRecordingState({
      meeting: activeMeeting,
      stats: createRecordingStats([
        { status: MEETING_RECORDING_STATUS.PENDING },
        { status: MEETING_RECORDING_STATUS.RECORDING },
        { status: MEETING_RECORDING_STATUS.READY }
      ]),
      viewerUser: { id: 'host-1', is_admin: false },
      runtimeAvailable: true
    }),
    {
      visible: true,
      status: 'recording',
      paused_at: null,
      paused_by: null,
      active_recording_count: 2,
      pending_recording_count: 1,
      recording_count: 1,
      can_pause: true,
      can_resume: false
    }
  )

  assert.deepEqual(
    buildTranscriptionRecordingState({
      meeting: {
        ...activeMeeting,
        transcription_recording_status: 'paused',
        transcription_recording_paused_at: '2026-04-14T10:00:00.000Z',
        transcription_recording_paused_by: 'host-1'
      },
      viewerUser: { id: 'host-1', is_admin: false },
      runtimeAvailable: false
    }),
    {
      visible: true,
      status: 'paused',
      paused_at: '2026-04-14T10:00:00.000Z',
      paused_by: 'host-1',
      active_recording_count: 0,
      pending_recording_count: 0,
      recording_count: 0,
      can_pause: false,
      can_resume: true
    }
  )

  assert.equal(buildTranscriptionRecordingState({
    meeting: { id: 'meeting-ended', status: 'ended' }
  }).visible, false)
})

test('meetings artifact state: summary generation exposes generate and retry rules', () => {
  const meeting = {
    id: 'meeting-1',
    status: 'ended',
    host_user_id: 'host-1'
  }

  assert.deepEqual(buildSummaryGenerationState({
    meeting,
    viewerUser: { id: 'participant-1', is_admin: false },
    manualRuntimeAvailable: true
  }), {
    available: true,
    allowed: true,
    action: 'generate',
    reason: null
  })

  assert.deepEqual(buildSummaryGenerationState({
    meeting,
    summaryArtifact: { status: 'failed' },
    viewerUser: { id: 'participant-1', is_admin: false },
    manualRuntimeAvailable: true
  }), {
    available: true,
    allowed: false,
    action: 'retry',
    reason: 'retry_forbidden'
  })

  assert.equal(buildSummaryGenerationState({
    meeting: { ...meeting, status: 'active' }
  }).reason, 'not_ended')
  assert.equal(buildSummaryGenerationState({
    meeting,
    summaryArtifact: { status: 'ready' },
    manualRuntimeAvailable: true
  }).reason, 'ready')
})

test('meetings artifact state: transcript generation requires runtime, retryable recordings, and host control', () => {
  const meeting = {
    id: 'meeting-1',
    status: 'ended',
    host_user_id: 'host-1'
  }
  const transcriptArtifact = { status: 'failed' }

  assert.deepEqual(buildTranscriptGenerationState({
    meeting,
    transcriptArtifact,
    viewerUser: { id: 'host-1', is_admin: false },
    transcriptionRuntimeAvailable: true,
    retryableRecordingCount: 1
  }), {
    available: true,
    allowed: true,
    action: 'retry',
    reason: null
  })

  assert.deepEqual(buildTranscriptGenerationState({
    meeting,
    transcriptArtifact,
    viewerUser: { id: 'participant-1', is_admin: false },
    transcriptionRuntimeAvailable: true,
    retryableRecordingCount: 1
  }), {
    available: true,
    allowed: false,
    action: 'retry',
    reason: 'retry_forbidden'
  })

  assert.equal(buildTranscriptGenerationState({
    meeting,
    transcriptArtifact,
    viewerUser: { id: 'host-1', is_admin: false },
    transcriptionRuntimeAvailable: false,
    retryableRecordingCount: 1
  }).reason, 'missing_runtime')
  assert.equal(buildTranscriptGenerationState({
    meeting,
    transcriptArtifact,
    viewerUser: { id: 'host-1', is_admin: false },
    transcriptionRuntimeAvailable: true,
    retryableRecordingCount: 0
  }).reason, 'no_retryable_recordings')
})

test('meetings artifact state: admin menu only appears for ended meetings with ready artifacts and downloadable audio', () => {
  const meeting = {
    id: 'meeting-1',
    status: 'ended'
  }

  assert.deepEqual(buildAdminArtifactMenuState({
    meeting,
    summaryArtifact: { status: 'ready' },
    transcriptArtifact: { status: 'ready' },
    viewerUser: { id: 'admin-1', is_admin: true },
    downloadableRecordingCount: 2
  }), {
    visible: true,
    can_regenerate_transcript: true,
    can_regenerate_summary: true,
    can_download_audio: true
  })

  assert.deepEqual(buildAdminArtifactMenuState({
    meeting,
    summaryArtifact: { status: 'ready' },
    transcriptArtifact: { status: 'ready' },
    viewerUser: { id: 'host-1', is_admin: false },
    downloadableRecordingCount: 2
  }), {
    visible: false,
    can_regenerate_transcript: false,
    can_regenerate_summary: false,
    can_download_audio: false
  })
})

test('meetings artifact state: visible artifacts and retryable recordings preserve legacy rules', () => {
  assert.deepEqual(filterVisibleMeetingArtifacts([
    { artifact_type: 'summary', status: 'pending', payload: null },
    { artifact_type: 'actions', status: 'pending', payload: undefined },
    { artifact_type: 'summary', status: 'pending', payload: { markdown: 'draft' } },
    { artifact_type: 'transcript', status: 'pending', payload: null }
  ]), [
    { artifact_type: 'summary', status: 'pending', payload: { markdown: 'draft' } },
    { artifact_type: 'transcript', status: 'pending', payload: null }
  ])

  assert.equal(isRetryableTranscriptRecording({
    status: MEETING_RECORDING_STATUS.READY,
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), true)
  assert.equal(isRetryableTranscriptRecording({
    status: MEETING_RECORDING_STATUS.FAILED,
    failure_code: 'transcription_failed',
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), true)
  assert.equal(isRetryableTranscriptRecording({
    status: MEETING_RECORDING_STATUS.FAILED,
    failure_code: 'egress_failed',
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), false)
  assert.equal(isRetryableTranscriptRecording({
    status: MEETING_RECORDING_STATUS.READY,
    storage_bucket: null,
    storage_key: 'meeting-1/audio.mp4'
  }), false)
  assert.equal(isDownloadableMeetingRecording({
    status: MEETING_RECORDING_STATUS.READY,
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), true)
  assert.equal(isDownloadableMeetingRecording({
    status: MEETING_RECORDING_STATUS.COMPLETED,
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), true)
  assert.equal(isDownloadableMeetingRecording({
    status: MEETING_RECORDING_STATUS.FAILED,
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), false)
  assert.equal(isRegeneratableTranscriptRecording({
    status: MEETING_RECORDING_STATUS.COMPLETED,
    storage_bucket: 'recordings',
    storage_key: 'meeting-1/audio.mp4'
  }), true)
})
