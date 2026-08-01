import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { MeetingRecordingControlDomainService } from '../src/domains/meetings/recording-control.js'
import { createMemoryDb } from './helpers/memory-db.js'
import { createMeetingsService } from './helpers/meetings-service.js'

const NOW_ISO = '2026-04-16T11:00:00.000Z'

function createApp({ emitted = [] } = {}) {
  return {
    service(name) {
      assert.equal(name, 'meetings')
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }
}

function createDomain({
  db,
  app,
  emitted,
  runtime = { provider: 'test' },
  startCalls = [],
  stopCalls = [],
  id = 'pause-generated-1'
} = {}) {
  const targetApp = app || createApp({ emitted })
  return new MeetingRecordingControlDomainService({
    db,
    app: targetApp,
    now: () => new Date(NOW_ISO),
    createIdFn: () => id,
    getActiveTranscriptionRuntimeFn: async () => runtime,
    startParticipantRecording: async (recordingApp, payload) => {
      startCalls.push({ app: recordingApp, payload })
    },
    stopParticipantRecordings: async (recordingApp, payload) => {
      stopCalls.push({ app: recordingApp, payload })
    }
  })
}

function meeting(overrides = {}) {
  return {
    id: 'meeting-1',
    status: 'active',
    host_user_id: 'host-1',
    chat_channel_id: 'chat-1',
    transcription_recording_status: 'active',
    transcription_recording_paused_at: null,
    transcription_recording_paused_by: null,
    ...overrides
  }
}

test('meetings recording-control: pause updates status, audits, stops recordings, and emits state', async () => {
  const emitted = []
  const stopCalls = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    meetings: [meeting()]
  })
  const domain = createDomain({ db, app, stopCalls })

  await domain.pause({
    meeting: meeting(),
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(db.tables.meetings[0].transcription_recording_status, 'paused')
  assert.equal(db.tables.meetings[0].transcription_recording_paused_at, NOW_ISO)
  assert.equal(db.tables.meetings[0].transcription_recording_paused_by, 'host-1')
  assert.deepEqual(db.tables.meeting_recording_pauses, [{
    id: 'pause-generated-1',
    meeting_id: 'meeting-1',
    paused_by: 'host-1',
    resumed_by: null,
    paused_at: NOW_ISO,
    resumed_at: null,
    created_at: NOW_ISO,
    updated_at: NOW_ISO
  }])
  assert.deepEqual(stopCalls, [{
    app,
    payload: { meetingId: 'meeting-1' }
  }])
  assert.deepEqual(emitted, [{
    eventName: 'recording-state-updated',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      status: 'paused'
    }
  }])
})

test('meetings recording-control: pause is idempotent when already paused', async () => {
  const emitted = []
  const stopCalls = []
  const db = createMemoryDb({
    meetings: [meeting({
      transcription_recording_status: 'paused',
      transcription_recording_paused_at: '2026-04-16T10:00:00.000Z',
      transcription_recording_paused_by: 'host-1'
    })],
    meeting_recording_pauses: [{
      id: 'pause-existing',
      meeting_id: 'meeting-1',
      paused_by: 'host-1',
      resumed_by: null,
      paused_at: '2026-04-16T10:00:00.000Z',
      resumed_at: null
    }]
  })
  const domain = createDomain({ db, emitted, stopCalls })

  await domain.pause({
    meeting: db.tables.meetings[0],
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(db.tables.meetings[0].transcription_recording_paused_at, '2026-04-16T10:00:00.000Z')
  assert.equal(db.tables.meeting_recording_pauses.length, 1)
  assert.deepEqual(stopCalls, [])
  assert.deepEqual(emitted, [])
})

test('meetings recording-control: resume updates status, closes audit pause, restarts participants, and emits state', async () => {
  const emitted = []
  const startCalls = []
  const app = createApp({ emitted })
  const db = createMemoryDb({
    meetings: [meeting({
      transcription_recording_status: 'paused',
      transcription_recording_paused_at: '2026-04-16T10:00:00.000Z',
      transcription_recording_paused_by: 'host-1'
    })],
    meeting_recording_pauses: [{
      id: 'pause-1',
      meeting_id: 'meeting-1',
      paused_by: 'host-1',
      resumed_by: null,
      paused_at: '2026-04-16T10:00:00.000Z',
      resumed_at: null
    }],
    voice_participants: [{
      id: 'vp-1',
      channel_id: 'chat-1',
      user_id: 'host-1'
    }],
    users: [{
      id: 'host-1',
      display_name: 'Host User'
    }]
  })
  const domain = createDomain({ db, app, startCalls })

  await domain.resume({
    meeting: db.tables.meetings[0],
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(db.tables.meetings[0].transcription_recording_status, 'active')
  assert.equal(db.tables.meetings[0].transcription_recording_paused_at, null)
  assert.equal(db.tables.meetings[0].transcription_recording_paused_by, null)
  assert.equal(db.tables.meeting_recording_pauses[0].resumed_by, 'host-1')
  assert.equal(db.tables.meeting_recording_pauses[0].resumed_at, NOW_ISO)
  assert.deepEqual(startCalls, [{
    app,
    payload: {
      meetingId: 'meeting-1',
      roomName: 'chat-1',
      userId: 'host-1',
      participantIdentity: 'host-1',
      participantDisplayName: 'Host User'
    }
  }])
  assert.deepEqual(emitted, [{
    eventName: 'recording-state-updated',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      status: 'active'
    }
  }])
})

test('meetings recording-control: resume rejects when transcription runtime is unavailable', async () => {
  const db = createMemoryDb({
    meetings: [meeting({
      transcription_recording_status: 'paused'
    })]
  })
  const domain = createDomain({ db, runtime: null })

  await assert.rejects(
    domain.resume({
      meeting: db.tables.meetings[0],
      user: { id: 'host-1', is_admin: false }
    }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meetings.transcription_recording_unavailable'
  )
})

test('meetings recording-control: participant restart deduplicates user lookup and falls back to IDs', async () => {
  const observedUserIds = []
  const startCalls = []
  const app = createApp()
  const db = (table) => {
    if (table === 'voice_participants') {
      return {
        where(field, value) {
          assert.equal(field, 'channel_id')
          assert.equal(value, 'chat-1')
          return this
        },
        async select(...columns) {
          assert.deepEqual(columns, ['user_id'])
          return [
            { user_id: 'host-1' },
            { user_id: 'host-1' },
            { user_id: 'guest-1' }
          ]
        }
      }
    }

    if (table === 'users') {
      return {
        whereIn(field, values) {
          assert.equal(field, 'id')
          observedUserIds.push(values)
          return this
        },
        async select(...columns) {
          assert.deepEqual(columns, ['id', 'display_name'])
          return [{ id: 'host-1', display_name: 'Host User' }]
        }
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  }
  const domain = createDomain({ db, app, startCalls })

  await domain.startRecordingsForConnectedMeetingParticipants(meeting())

  assert.deepEqual(observedUserIds, [['host-1', 'guest-1']])
  assert.deepEqual(startCalls.map((call) => call.payload.participantDisplayName), [
    'Host User',
    'Host User',
    'guest-1'
  ])
})

test('meetings transcription recording: host can pause recording and audit pause without content', async () => {
  const emitted = []
  const app = {
    get(name) {
      if (name === 'postgresqlClient') return db
      if (name === 'authentication') return { secret: 'test-secret' }
      return null
    },
    service(name) {
      assert.equal(name, 'meetings')
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }
  const db = createMemoryDb({
    meetings: [{
      id: 'meeting-recording-1',
      status: 'active',
      host_user_id: 'host-1',
      chat_channel_id: 'chat-recording-1',
      transcription_recording_status: 'active',
      transcription_recording_paused_at: null,
      transcription_recording_paused_by: null
    }],
    meeting_recordings: [{
      id: 'recording-pending-1',
      meeting_id: 'meeting-recording-1',
      user_id: 'host-1',
      status: 'pending',
      livekit_egress_id: null
    }]
  })
  const service = createMeetingsService({ db, app })
  service._getMeetingOrThrow = async (id) => db('meetings').where('id', id).first()
  service._assertCanAccessMeeting = async () => true
  service.get = async (id) => db('meetings').where('id', id).first()

  const result = await service.pauseTranscriptionRecording('meeting-recording-1', {}, {
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(result.transcription_recording_status, 'paused')
  assert.equal(result.transcription_recording_paused_by, 'host-1')
  assert.equal(db.tables.meeting_recording_pauses.length, 1)
  assert.equal(db.tables.meeting_recording_pauses[0].paused_by, 'host-1')
  assert.equal(db.tables.meeting_recording_pauses[0].resumed_at, null)
  assert.equal(db.tables.meeting_recordings[0].status, 'failed')
  assert.equal(db.tables.meeting_recordings[0].failure_code, 'egress_missing')
  assert.ok(emitted.find((event) => event.eventName === 'recording-state-updated'))
})

test('meetings transcription recording: only host or admin can pause or resume', async () => {
  const db = createMemoryDb({
    meetings: [{
      id: 'meeting-recording-forbidden',
      status: 'active',
      host_user_id: 'host-1',
      chat_channel_id: 'chat-recording-forbidden',
      transcription_recording_status: 'active'
    }]
  })
  const service = createMeetingsService({
    db,
    app: {
      get(name) {
        if (name === 'postgresqlClient') return db
        return null
      },
      service() {
        return { emit() {} }
      }
    }
  })
  service._assertCanAccessMeeting = async () => true
  service._getMeetingOrThrow = async (id) => db('meetings').where('id', id).first()

  await assert.rejects(
    () => service.pauseTranscriptionRecording('meeting-recording-forbidden', {}, {
      user: { id: 'member-1', is_admin: false }
    }),
    Forbidden
  )
})

test('meetings transcription recording: host can resume and restart current participant recordings', async () => {
  const emitted = []
  const app = {
    get(name) {
      if (name === 'postgresqlClient') return db
      if (name === 'authentication') return { secret: 'test-secret' }
      return null
    },
    service(name) {
      assert.equal(name, 'meetings')
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
      model: 'gpt-4o-transcribe'
    }],
    ai_provider_instances: [{
      id: 'provider-1',
      provider_type: 'openai',
      enabled: true
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'provider-1',
      encrypted_secret: encryptSecret(app, 'sk-test')
    }],
    meetings: [{
      id: 'meeting-recording-resume',
      status: 'active',
      host_user_id: 'host-1',
      chat_channel_id: 'chat-recording-resume',
      transcription_recording_status: 'paused',
      transcription_recording_paused_at: '2026-04-14T10:00:00.000Z',
      transcription_recording_paused_by: 'host-1'
    }],
    meeting_recording_pauses: [{
      id: 'pause-1',
      meeting_id: 'meeting-recording-resume',
      paused_by: 'host-1',
      resumed_by: null,
      paused_at: '2026-04-14T10:00:00.000Z',
      resumed_at: null
    }],
    voice_participants: [{
      id: 'vp-1',
      channel_id: 'chat-recording-resume',
      user_id: 'host-1'
    }]
  })
  const service = createMeetingsService({ db, app })
  const restarted = []
  service._getMeetingOrThrow = async (id) => db('meetings').where('id', id).first()
  service._assertCanAccessMeeting = async () => true
  service.recordingControlDomainService.startRecordingsForConnectedMeetingParticipants = async (meeting) => {
    restarted.push(meeting.id)
  }
  service.get = async (id) => db('meetings').where('id', id).first()

  const result = await service.resumeTranscriptionRecording('meeting-recording-resume', {}, {
    user: { id: 'host-1', is_admin: false }
  })

  assert.equal(result.transcription_recording_status, 'active')
  assert.equal(result.transcription_recording_paused_at, null)
  assert.equal(db.tables.meeting_recording_pauses[0].resumed_by, 'host-1')
  assert.ok(db.tables.meeting_recording_pauses[0].resumed_at)
  assert.deepEqual(restarted, ['meeting-recording-resume'])
  assert.ok(emitted.find((event) => event.eventName === 'recording-state-updated'))
})
