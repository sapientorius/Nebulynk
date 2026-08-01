import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { MEETING_RECORDING_STATUS } from '../src/lib/meeting-recordings.js'
import { MeetingArtifactsDomainService } from '../src/domains/meetings/artifacts.js'
import { createMemoryDb } from './helpers/memory-db.js'
import { createMeetingsService } from './helpers/meetings-service.js'

const NOW_ISO = '2026-04-16T10:30:00.000Z'

function createApp({ emitted = [] } = {}) {
  return {
    get(name) {
      if (name === 'authentication') return { secret: 'secret-key' }
      return null
    },
    service() {
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }
}

function createDomain({ db, app, emitted, id = 'artifact-generated' } = {}) {
  const targetApp = app || createApp({ emitted })
  return new MeetingArtifactsDomainService({
    db,
    app: targetApp,
    now: () => new Date(NOW_ISO),
    createIdFn: () => id
  })
}

function summaryRuntimeSeed(app, { enabled = true } = {}) {
  return {
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled,
      provider_instance_id: 'provider-summary',
      model: 'gpt-4.1-mini'
    }],
    ai_provider_instances: [{
      id: 'provider-summary',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-summary',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }]
  }
}

function transcriptRuntimeSeed(app) {
  return {
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'provider-transcription',
      model: 'whisper-1'
    }],
    ai_provider_instances: [{
      id: 'provider-transcription',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-transcription',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }]
  }
}

function meeting(overrides = {}) {
  return {
    id: 'meeting-1',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1',
    ...overrides
  }
}

test('meetings artifacts: queue helpers insert, update, and reset payloads', async () => {
  const db = createMemoryDb({
    meeting_artifacts: [{
      id: 'summary-artifact',
      meeting_id: 'meeting-1',
      artifact_type: 'summary',
      status: 'ready',
      payload: { markdown: 'Old summary' },
      created_at: '2026-04-16T09:00:00.000Z',
      updated_at: '2026-04-16T09:00:00.000Z'
    }]
  })
  const domain = createDomain({ db, id: 'transcript-artifact' })

  await db.transaction(async (trx) => {
    await domain.queueProcessingArtifact(trx, {
      meetingId: 'meeting-1',
      artifactType: 'summary',
      nowIso: NOW_ISO,
      resetPayload: true
    })
    await domain.queueProcessingArtifact(trx, {
      meetingId: 'meeting-1',
      artifactType: 'transcript',
      nowIso: NOW_ISO,
      resetPayload: true
    })
  })

  assert.deepEqual(db.tables.meeting_artifacts, [{
    id: 'summary-artifact',
    meeting_id: 'meeting-1',
    artifact_type: 'summary',
    status: 'processing',
    payload: null,
    created_at: '2026-04-16T09:00:00.000Z',
    updated_at: NOW_ISO
  }, {
    id: 'transcript-artifact',
    meeting_id: 'meeting-1',
    artifact_type: 'transcript',
    status: 'processing',
    payload: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO
  }])
})

test('meetings artifacts: queued event preserves payload shape and skips empty type lists', () => {
  const emitted = []
  const domain = createDomain({ db: createMemoryDb(), emitted })

  domain.emitArtifactsQueued(meeting(), {
    artifactTypes: [],
    reason: 'manual'
  })
  assert.deepEqual(emitted, [])

  domain.emitArtifactsQueued(meeting(), {
    artifactTypes: ['summary'],
    reason: 'manual'
  })

  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['summary'],
      reason: 'manual'
    }
  }])
})

test('meetings artifacts: summary generation queues missing summaries and failed host retries', async () => {
  const emitted = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    ...summaryRuntimeSeed(app, { enabled: false }),
    meeting_artifacts: [{
      id: 'legacy-placeholder',
      meeting_id: 'meeting-legacy',
      artifact_type: 'summary',
      status: 'pending',
      payload: null,
      created_at: '2026-04-16T09:00:00.000Z',
      updated_at: '2026-04-16T09:00:00.000Z'
    }, {
      id: 'failed-summary',
      meeting_id: 'meeting-retry',
      artifact_type: 'summary',
      status: 'failed',
      payload: { failure_message: 'provider timeout' },
      created_at: '2026-04-16T09:00:00.000Z',
      updated_at: '2026-04-16T09:00:00.000Z'
    }]
  })
  const domain = createDomain({ db, app, id: 'generated-summary' })

  await domain.generateSummary({
    meeting: meeting(),
    user: { id: 'participant-1', is_admin: false }
  })
  await domain.generateSummary({
    meeting: meeting({ id: 'meeting-retry', chat_channel_id: 'chat-retry', source_channel_id: 'source-retry' }),
    user: { id: 'host-1', is_admin: false },
    reason: 'retry'
  })

  assert.equal(db.tables.meeting_artifacts.find((row) => row.id === 'legacy-placeholder').status, 'pending')
  assert.deepEqual(db.tables.meeting_artifacts.find((row) => row.id === 'generated-summary'), {
    id: 'generated-summary',
    meeting_id: 'meeting-1',
    artifact_type: 'summary',
    status: 'processing',
    payload: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO
  })
  assert.equal(db.tables.meeting_artifacts.find((row) => row.id === 'failed-summary').status, 'processing')
  assert.equal(db.tables.meeting_artifacts.find((row) => row.id === 'failed-summary').payload, null)
  assert.equal(emitted.length, 2)
  assert.equal(emitted[0].payload.reason, 'manual')
  assert.equal(emitted[1].payload.reason, 'retry')
})

test('meetings artifacts: summary generation rejects retry and state guard cases', async () => {
  const app = createApp()
  const domain = createDomain({
    app,
    db: createMemoryDb({
      ...summaryRuntimeSeed(app),
      meeting_artifacts: [{
        id: 'failed-summary',
        meeting_id: 'meeting-failed',
        artifact_type: 'summary',
        status: 'failed',
        payload: { failure_message: 'provider timeout' }
      }, {
        id: 'ready-summary',
        meeting_id: 'meeting-ready',
        artifact_type: 'summary',
        status: 'ready',
        payload: { markdown: 'Done' }
      }, {
        id: 'processing-summary',
        meeting_id: 'meeting-processing',
        artifact_type: 'summary',
        status: 'processing',
        payload: null
      }]
    })
  })

  await assert.rejects(
    domain.generateSummary({
      meeting: meeting({ id: 'meeting-failed' }),
      user: { id: 'participant-1', is_admin: false }
    }),
    Forbidden
  )
  await assert.rejects(
    domain.generateSummary({
      meeting: meeting({ id: 'meeting-ready' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof Forbidden && error.error_code === 'api.meetings.summary_regenerate_forbidden'
  )
  await assert.rejects(
    domain.generateSummary({
      meeting: meeting({ id: 'meeting-processing' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_already_processing'
  )
  await assert.rejects(
    domain.generateSummary({
      meeting: meeting({ status: 'active' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_not_ended'
  )
  await assert.rejects(
    createDomain({ db: createMemoryDb(), app }).generateSummary({
      meeting: meeting(),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_unavailable'
  )
})

test('meetings artifacts: admins can regenerate ready summaries and overwrite the payload', async () => {
  const emitted = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    ...summaryRuntimeSeed(app),
    meeting_artifacts: [{
      id: 'ready-summary',
      meeting_id: 'meeting-ready',
      artifact_type: 'summary',
      status: 'ready',
      payload: { markdown: 'Old summary' },
      created_at: '2026-04-16T09:00:00.000Z',
      updated_at: '2026-04-16T09:00:00.000Z'
    }]
  })
  const domain = createDomain({ db, app })

  await domain.generateSummary({
    meeting: meeting({ id: 'meeting-ready' }),
    user: { id: 'admin-1', is_admin: true },
    reason: 'admin_regenerate'
  })

  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_artifacts[0].payload, null)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-ready',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['summary'],
      reason: 'admin_regenerate'
    }
  }])
})

test('meetings artifacts: transcript retry queues artifact and resets regeneratable recordings', async () => {
  const emitted = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    ...transcriptRuntimeSeed(app),
    meeting_artifacts: [{
      id: 'transcript-artifact',
      meeting_id: 'meeting-1',
      artifact_type: 'transcript',
      status: 'failed',
      payload: { warnings: [{ code: 'transcription_failed' }] }
    }],
    meeting_recordings: [{
      id: 'recording-transcription-failed',
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket',
      storage_key: 'meeting-1/user-1/recording.mp4',
      failure_code: 'transcription_failed',
      failure_message: 'provider timeout'
    }, {
      id: 'recording-egress-failed',
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket',
      storage_key: 'meeting-1/user-2/recording.mp4',
      failure_code: 'egress_failed',
      failure_message: 'egress failed'
    }, {
      id: 'recording-ready',
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.READY,
      storage_bucket: 'bucket',
      storage_key: 'meeting-1/user-3/recording.mp4',
      failure_code: null,
      failure_message: null
    }, {
      id: 'recording-completed',
      meeting_id: 'meeting-1',
      status: MEETING_RECORDING_STATUS.COMPLETED,
      storage_bucket: 'bucket',
      storage_key: 'meeting-1/user-4/recording.mp4',
      failure_code: null,
      failure_message: null
    }]
  })
  const domain = createDomain({ db, app })

  await domain.generateTranscript({
    meeting: meeting(),
    user: { id: 'host-1', is_admin: false },
    reason: 'retry'
  })

  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_artifacts[0].payload, null)
  assert.equal(db.tables.meeting_recordings[0].status, MEETING_RECORDING_STATUS.READY)
  assert.equal(db.tables.meeting_recordings[0].failure_code, null)
  assert.equal(db.tables.meeting_recordings[0].failure_message, null)
  assert.equal(db.tables.meeting_recordings[1].status, MEETING_RECORDING_STATUS.FAILED)
  assert.equal(db.tables.meeting_recordings[2].status, MEETING_RECORDING_STATUS.READY)
  assert.equal(db.tables.meeting_recordings[3].status, MEETING_RECORDING_STATUS.READY)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['transcript'],
      reason: 'retry'
    }
  }])
})

test('meetings artifacts: transcript retry rejects permission and state guard cases', async () => {
  const app = createApp()
  const runtimeSeed = transcriptRuntimeSeed(app)
  const domain = createDomain({
    app,
    db: createMemoryDb({
      ...runtimeSeed,
      meeting_artifacts: [{
        id: 'failed-transcript',
        meeting_id: 'meeting-failed',
        artifact_type: 'transcript',
        status: 'failed',
        payload: { warnings: [{ code: 'transcription_failed' }] }
      }, {
        id: 'ready-transcript',
        meeting_id: 'meeting-ready',
        artifact_type: 'transcript',
        status: 'ready',
        payload: { text: 'Done' }
      }, {
        id: 'processing-transcript',
        meeting_id: 'meeting-processing',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null
      }],
      meeting_recordings: [{
        id: 'recording-ready',
        meeting_id: 'meeting-failed',
        status: MEETING_RECORDING_STATUS.READY,
        storage_bucket: 'bucket',
        storage_key: 'meeting-failed/user-1/recording.mp4'
      }]
    })
  })

  await assert.rejects(
    domain.generateTranscript({
      meeting: meeting({ id: 'meeting-failed' }),
      user: { id: 'participant-1', is_admin: false }
    }),
    Forbidden
  )
  await assert.rejects(
    domain.generateTranscript({
      meeting: meeting({ id: 'meeting-ready' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof Forbidden && error.error_code === 'api.meetings.transcript_regenerate_forbidden'
  )
  await assert.rejects(
    domain.generateTranscript({
      meeting: meeting({ id: 'meeting-processing' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_already_processing'
  )
  await assert.rejects(
    domain.generateTranscript({
      meeting: meeting({ id: 'meeting-no-failed' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_no_retryable_recordings'
  )
  await assert.rejects(
    domain.generateTranscript({
      meeting: meeting({ status: 'active' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_not_ended'
  )
  await assert.rejects(
    createDomain({
      app,
      db: createMemoryDb({
        meeting_artifacts: [{
          id: 'failed-transcript',
          meeting_id: 'meeting-no-runtime',
          artifact_type: 'transcript',
          status: 'failed'
        }]
      })
    }).generateTranscript({
      meeting: meeting({ id: 'meeting-no-runtime' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_unavailable'
  )
  await assert.rejects(
    createDomain({
      app,
      db: createMemoryDb({
        ...runtimeSeed,
        meeting_artifacts: [{
          id: 'failed-transcript',
          meeting_id: 'meeting-no-recordings',
          artifact_type: 'transcript',
          status: 'failed'
        }],
        meeting_recordings: [{
          id: 'recording-egress-failed',
          meeting_id: 'meeting-no-recordings',
          status: MEETING_RECORDING_STATUS.FAILED,
          storage_bucket: 'bucket',
          storage_key: 'meeting-no-recordings/user-1/recording.mp4',
          failure_code: 'egress_failed'
        }]
      })
    }).generateTranscript({
      meeting: meeting({ id: 'meeting-no-recordings' }),
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_no_retryable_recordings'
  )
})

test('meetings artifacts: admins can regenerate ready transcripts and reset completed recordings', async () => {
  const emitted = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    ...transcriptRuntimeSeed(app),
    meeting_artifacts: [{
      id: 'ready-transcript',
      meeting_id: 'meeting-ready',
      artifact_type: 'transcript',
      status: 'ready',
      payload: { text: 'Old transcript' }
    }],
    meeting_recordings: [{
      id: 'recording-completed',
      meeting_id: 'meeting-ready',
      status: MEETING_RECORDING_STATUS.COMPLETED,
      storage_bucket: 'bucket',
      storage_key: 'meeting-ready/user-1/recording.mp4',
      failure_code: null,
      failure_message: null
    }, {
      id: 'recording-ready',
      meeting_id: 'meeting-ready',
      status: MEETING_RECORDING_STATUS.READY,
      storage_bucket: 'bucket',
      storage_key: 'meeting-ready/user-2/recording.mp4',
      failure_code: null,
      failure_message: null
    }]
  })
  const domain = createDomain({ db, app })

  await domain.generateTranscript({
    meeting: meeting({ id: 'meeting-ready' }),
    user: { id: 'admin-1', is_admin: true },
    reason: 'admin_regenerate'
  })

  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_artifacts[0].payload, null)
  assert.equal(db.tables.meeting_recordings[0].status, MEETING_RECORDING_STATUS.READY)
  assert.equal(db.tables.meeting_recordings[1].status, MEETING_RECORDING_STATUS.READY)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-ready',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['transcript'],
      reason: 'admin_regenerate'
    }
  }])
})

test('meetings artifacts: end queue type resolution skips transcript without recordings', async () => {
  const app = createApp()
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: true,
      provider_instance_id: 'summary-provider',
      model: 'gpt-4.1-mini'
    }, {
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'transcription-provider',
      model: 'whisper-1'
    }],
    meeting_recordings: [{
      id: 'recording-1',
      meeting_id: 'meeting-with-recording'
    }]
  })
  const domain = createDomain({ db, app })

  assert.deepEqual(await domain.resolveEndedMeetingArtifactTypes('meeting-without-recording'), ['summary'])
  assert.deepEqual(await domain.resolveEndedMeetingArtifactTypes('meeting-with-recording'), ['summary', 'transcript'])
})

test('meetings summary generation: participant can queue a missing summary even when auto-summary is disabled', async () => {
  const emitted = []
  const app = {
    service(name) {
      if (name === 'meetings') {
        return {
          emit(eventName, payload) {
            emitted.push({ eventName, payload })
          }
        }
      }
      return { emit() {} }
    }
  }

  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: false,
      provider_instance_id: 'provider-1',
      model: 'gpt-4.1-mini'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }]
  })

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-summary-1',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async (id) => ({ id, status: 'ended' })

  const result = await service.generateSummary('meeting-summary-1', {}, {
    user: { id: 'participant-1', is_admin: false }
  })

  assert.equal(result.status, 'ended')
  assert.deepEqual(db.tables.meeting_artifacts, [{
    id: db.tables.meeting_artifacts[0].id,
    meeting_id: 'meeting-summary-1',
    artifact_type: 'summary',
    status: 'processing',
    payload: null,
    created_at: db.tables.meeting_artifacts[0].created_at,
    updated_at: db.tables.meeting_artifacts[0].updated_at
  }])
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-summary-1',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['summary'],
      reason: 'manual'
    }
  }])
})

test('meetings summary generation: failed summaries can only be retried by host or admin', async () => {
  const app = {
    service() {
      return { emit() {} }
    }
  }

  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'gpt-4.1-mini'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }],
    meeting_artifacts: [{
      id: 'artifact-1',
      meeting_id: 'meeting-summary-2',
      artifact_type: 'summary',
      status: 'failed',
      payload: { failure_message: 'provider timeout' },
      created_at: '2026-03-30T10:00:00.000Z',
      updated_at: '2026-03-30T10:01:00.000Z'
    }]
  })

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-summary-2',
    status: 'ended',
    source_channel_id: 'source-2',
    chat_channel_id: 'chat-2',
    host_user_id: 'host-2'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async (id) => ({ id, status: 'ended' })

  await assert.rejects(
    service.generateSummary('meeting-summary-2', {}, {
      user: { id: 'participant-2', is_admin: false }
    }),
    Forbidden
  )

  await service.generateSummary('meeting-summary-2', {}, {
    user: { id: 'host-2', is_admin: false }
  })

  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_artifacts[0].payload, null)
})

test('meetings summary generation: rejects ready, processing, not-ended, and missing-runtime cases', async () => {
  const app = {
    service() {
      return { emit() {} }
    }
  }

  const serviceMissingRuntime = createMeetingsService({
    db: createMemoryDb(),
    app
  })
  serviceMissingRuntime._getMeetingOrThrow = async () => ({
    id: 'meeting-missing-runtime',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceMissingRuntime._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceMissingRuntime.generateSummary('meeting-missing-runtime', {}, {
      user: { id: 'participant-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_unavailable'
  )

  const dbReady = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'gpt-4.1-mini'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }],
    meeting_artifacts: [{
      id: 'artifact-ready',
      meeting_id: 'meeting-ready',
      artifact_type: 'summary',
      status: 'ready',
      payload: { markdown: 'Summary' },
      created_at: '2026-03-30T10:00:00.000Z',
      updated_at: '2026-03-30T10:01:00.000Z'
    }]
  })

  const serviceReady = createMeetingsService({ db: dbReady, app })
  serviceReady._getMeetingOrThrow = async () => ({
    id: 'meeting-ready',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceReady._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceReady.generateSummary('meeting-ready', {}, {
      user: { id: 'participant-1', is_admin: false }
    }),
    (error) => error instanceof Forbidden && error.error_code === 'api.meetings.summary_regenerate_forbidden'
  )

  const dbProcessing = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'gpt-4.1-mini'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }],
    meeting_artifacts: [{
      id: 'artifact-processing',
      meeting_id: 'meeting-processing',
      artifact_type: 'summary',
      status: 'processing',
      payload: null,
      created_at: '2026-03-30T10:00:00.000Z',
      updated_at: '2026-03-30T10:01:00.000Z'
    }]
  })

  const serviceProcessing = createMeetingsService({ db: dbProcessing, app })
  serviceProcessing._getMeetingOrThrow = async () => ({
    id: 'meeting-processing',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceProcessing._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceProcessing.generateSummary('meeting-processing', {}, {
      user: { id: 'participant-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_already_processing'
  )

  const serviceNotEnded = createMeetingsService({ db: dbReady, app })
  serviceNotEnded._getMeetingOrThrow = async () => ({
    id: 'meeting-active',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceNotEnded._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceNotEnded.generateSummary('meeting-active', {}, {
      user: { id: 'participant-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.summary_generation_not_ended'
  )
})

test('meetings transcript generation: host can retry failed provider transcription recordings', async () => {
  const emitted = []
  const app = {
    get(name) {
      if (name === 'authentication') return { secret: 'secret-key' }
      return null
    },
    service() {
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }

  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'whisper-1'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }],
    meeting_artifacts: [{
      id: 'transcript-artifact-1',
      meeting_id: 'meeting-transcript-1',
      artifact_type: 'transcript',
      status: 'failed',
      payload: { warnings: [{ code: 'transcription_failed' }] },
      created_at: '2026-04-14T10:00:00.000Z',
      updated_at: '2026-04-14T10:01:00.000Z'
    }],
    meeting_recordings: [{
      id: 'recording-transcription-failed',
      meeting_id: 'meeting-transcript-1',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-transcript-1/user-1/recording-1.mp4',
      failure_code: 'transcription_failed',
      failure_message: 'provider timeout',
      updated_at: '2026-04-14T10:01:00.000Z'
    }, {
      id: 'recording-egress-failed',
      meeting_id: 'meeting-transcript-1',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-transcript-1/user-2/recording-2.mp4',
      failure_code: 'egress_failed',
      failure_message: 'egress failed',
      updated_at: '2026-04-14T10:01:00.000Z'
    }, {
      id: 'recording-ready',
      meeting_id: 'meeting-transcript-1',
      status: MEETING_RECORDING_STATUS.READY,
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-transcript-1/user-3/recording-3.mp4',
      failure_code: null,
      failure_message: null,
      updated_at: '2026-04-14T10:01:00.000Z'
    }]
  })

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-transcript-1',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async (id) => ({ id, status: 'ended' })

  const result = await service.generateTranscript('meeting-transcript-1', {}, {
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(result.status, 'ended')
  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_artifacts[0].payload, null)
  assert.equal(db.tables.meeting_recordings[0].status, MEETING_RECORDING_STATUS.READY)
  assert.equal(db.tables.meeting_recordings[0].failure_code, null)
  assert.equal(db.tables.meeting_recordings[0].failure_message, null)
  assert.equal(db.tables.meeting_recordings[1].status, MEETING_RECORDING_STATUS.FAILED)
  assert.equal(db.tables.meeting_recordings[2].status, MEETING_RECORDING_STATUS.READY)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-queued',
    payload: {
      meetingId: 'meeting-transcript-1',
      chatChannelId: 'chat-1',
      sourceChannelId: 'source-1',
      artifactTypes: ['transcript'],
      reason: 'manual'
    }
  }])
})

test('meetings transcript generation: failed transcripts can only be retried by host or admin', async () => {
  const app = {
    get(name) {
      if (name === 'authentication') return { secret: 'secret-key' }
      return null
    },
    service() {
      return { emit() {} }
    }
  }
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'whisper-1'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }],
    meeting_artifacts: [{
      id: 'transcript-artifact-2',
      meeting_id: 'meeting-transcript-2',
      artifact_type: 'transcript',
      status: 'failed',
      payload: { warnings: [{ code: 'transcription_failed' }] },
      created_at: '2026-04-14T10:00:00.000Z',
      updated_at: '2026-04-14T10:01:00.000Z'
    }],
    meeting_recordings: [{
      id: 'recording-transcription-failed',
      meeting_id: 'meeting-transcript-2',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-transcript-2/user-1/recording-1.mp4',
      failure_code: 'transcription_failed',
      failure_message: 'provider timeout'
    }]
  })

  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async () => ({
    id: 'meeting-transcript-2',
    status: 'ended',
    source_channel_id: 'source-2',
    chat_channel_id: 'chat-2',
    host_user_id: 'host-2'
  })
  service._assertCanAccessMeeting = async () => {}
  service.get = async (id) => ({ id, status: 'ended' })

  await assert.rejects(
    service.generateTranscript('meeting-transcript-2', {}, {
      user: { id: 'participant-2', is_admin: false }
    }),
    Forbidden
  )

  await service.generateTranscript('meeting-transcript-2', {}, {
    user: { id: 'host-2', is_admin: false }
  })

  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
  assert.equal(db.tables.meeting_recordings[0].status, MEETING_RECORDING_STATUS.READY)
})

test('meetings transcript generation: rejects ready, processing, not-ended, missing-runtime, and no-recording cases', async () => {
  const app = {
    get(name) {
      if (name === 'authentication') return { secret: 'secret-key' }
      return null
    },
    service() {
      return { emit() {} }
    }
  }

  const serviceMissingRuntime = createMeetingsService({
    db: createMemoryDb({
      meeting_artifacts: [{
        id: 'transcript-artifact-missing-runtime',
        meeting_id: 'meeting-missing-runtime',
        artifact_type: 'transcript',
        status: 'failed',
        payload: { warnings: [{ code: 'transcription_failed' }] }
      }]
    }),
    app
  })
  serviceMissingRuntime._getMeetingOrThrow = async () => ({
    id: 'meeting-missing-runtime',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceMissingRuntime._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceMissingRuntime.generateTranscript('meeting-missing-runtime', {}, {
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_unavailable'
  )

  const runtimeSeed = {
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'provider-1',
      model: 'whisper-1'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'secret-key')
    }]
  }

  const dbReady = createMemoryDb({
    ...runtimeSeed,
    meeting_artifacts: [{
      id: 'transcript-artifact-ready',
      meeting_id: 'meeting-ready',
      artifact_type: 'transcript',
      status: 'ready',
      payload: { text: 'Transcript' }
    }]
  })
  const serviceReady = createMeetingsService({ db: dbReady, app })
  serviceReady._getMeetingOrThrow = async () => ({
    id: 'meeting-ready',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceReady._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceReady.generateTranscript('meeting-ready', {}, {
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof Forbidden && error.error_code === 'api.meetings.transcript_regenerate_forbidden'
  )

  const dbProcessing = createMemoryDb({
    ...runtimeSeed,
    meeting_artifacts: [{
      id: 'transcript-artifact-processing',
      meeting_id: 'meeting-processing',
      artifact_type: 'transcript',
      status: 'processing',
      payload: null
    }]
  })
  const serviceProcessing = createMeetingsService({ db: dbProcessing, app })
  serviceProcessing._getMeetingOrThrow = async () => ({
    id: 'meeting-processing',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceProcessing._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceProcessing.generateTranscript('meeting-processing', {}, {
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_already_processing'
  )

  const serviceNotEnded = createMeetingsService({ db: dbReady, app })
  serviceNotEnded._getMeetingOrThrow = async () => ({
    id: 'meeting-active',
    status: 'active',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceNotEnded._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceNotEnded.generateTranscript('meeting-active', {}, {
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_not_ended'
  )

  const dbNoRecordings = createMemoryDb({
    ...runtimeSeed,
    meeting_artifacts: [{
      id: 'transcript-artifact-no-recordings',
      meeting_id: 'meeting-no-recordings',
      artifact_type: 'transcript',
      status: 'failed',
      payload: { warnings: [{ code: 'egress_failed' }] }
    }],
    meeting_recordings: [{
      id: 'recording-egress-failed',
      meeting_id: 'meeting-no-recordings',
      status: MEETING_RECORDING_STATUS.FAILED,
      storage_bucket: 'bucket-1',
      storage_key: 'meeting-recordings/meeting-no-recordings/user-1/recording-1.mp4',
      failure_code: 'egress_failed',
      failure_message: 'egress failed'
    }]
  })
  const serviceNoRecordings = createMeetingsService({ db: dbNoRecordings, app })
  serviceNoRecordings._getMeetingOrThrow = async () => ({
    id: 'meeting-no-recordings',
    status: 'ended',
    source_channel_id: 'source-1',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })
  serviceNoRecordings._assertCanAccessMeeting = async () => {}

  await assert.rejects(
    serviceNoRecordings.generateTranscript('meeting-no-recordings', {}, {
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcript_generation_no_retryable_recordings'
  )
})
