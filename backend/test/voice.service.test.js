import test from 'node:test'
import assert from 'node:assert/strict'
import { VoiceService } from '../src/services/voice/voice.js'

function createHarness({
  existingChannelId,
  leaveCleanupRoom = false,
  activeMeeting = null,
  channelPurpose = null,
  meetingVideoEnabled = 'true'
} = {}) {
  const calls = {
    addParticipant: [],
    leaveParticipant: []
  }
  const emitted = []
  const meetingState = activeMeeting ? { ...activeMeeting } : null

  const domainService = {
    async resolveJoinChannel(channelId) {
      return { id: channelId, name: `Voice ${channelId}`, purpose: channelPurpose }
    },
    async findCurrentChannelForUser() {
      return existingChannelId || null
    },
    buildParticipant({ channelId, userId }) {
      return {
        id: `vp-${channelId}-${userId}`,
        channel_id: channelId,
        user_id: userId,
        is_muted: false,
        is_deafened: false,
        is_video_enabled: false
      }
    },
    async addParticipant(participant) {
      calls.addParticipant.push(participant)
    },
    async listParticipantsByChannel(channelId) {
      return [{
        channel_id: channelId,
        user_id: 'user-self',
        display_name: 'Self User',
        status: 'online',
        is_video_enabled: false
      }]
    },
    async leaveParticipant(channelId, userId) {
      calls.leaveParticipant.push({ channelId, userId })
      return {
        left: true,
        cleanupRoom: leaveCleanupRoom
      }
    },
    async updateParticipant() {
      return {
        is_muted: false,
        is_deafened: false,
        is_video_enabled: true
      }
    }
  }

  const db = (table) => {
    if (table === 'meeting_recordings') {
      const filters = []
      const builder = {
        where(field, value) {
          if (typeof field === 'object') {
            filters.push((row) => Object.entries(field).every(([key, expected]) => row[key] === expected))
          } else {
            filters.push((row) => row[field] === value)
          }
          return builder
        },
        async select() {
          return []
        },
        async update() {
          return 0
        }
      }

      return builder
    }

    if (table === 'platform_settings') {
      const builder = {
        where(field, value) {
          builder.key = field === 'key' ? value : null
          return builder
        },
        async first() {
          if (builder.key !== 'meeting_video_enabled') return undefined
          return { key: 'meeting_video_enabled', value: meetingVideoEnabled }
        }
      }
      return builder
    }

    if (table !== 'meetings') {
      throw new Error(`Unexpected table access: ${table}`)
    }

    const filters = []
    const builder = {
      where(condition) {
        filters.push((row) => Object.entries(condition).every(([key, value]) => row[key] === value))
        return builder
      },
      whereNull(key) {
        filters.push((row) => row[key] == null)
        return builder
      },
      whereNotNull(key) {
        filters.push((row) => row[key] != null)
        return builder
      },
      async first() {
        if (!meetingState) return undefined
        const matches = filters.every((fn) => fn(meetingState))
        return matches ? { ...meetingState } : undefined
      },
      async update(values) {
        if (!meetingState) return 0
        const matches = filters.every((fn) => fn(meetingState))
        if (!matches) return 0
        Object.assign(meetingState, values)
        return 1
      }
    }

    return builder
  }

  const app = {
    get(key) {
      if (key === 'postgresqlClient') {
        return db
      }
      throw new Error(`Unexpected app.get access: ${key}`)
    },
    service(name) {
      if (name === 'voice') {
        return {
          emit(event, payload) {
            emitted.push({ event, payload })
          }
        }
      }

      if (name === 'meetings') {
        return {
          async patch() {
            return { ok: true }
          }
        }
      }

      throw new Error(`Unexpected service access: ${name}`)
    }
  }

  return {
    service: new VoiceService({ app, domainService }),
    calls,
    emitted,
    meetingState
  }
}

test('voice service: create is idempotent for same channel and emits no leave/join churn', async () => {
  const { service, calls, emitted } = createHarness({
    existingChannelId: 'voice-1'
  })

  const result = await service.create(
    { channel_id: 'voice-1' },
    {
      user: {
        id: 'user-self',
        display_name: 'Self User',
        avatar_url: null,
        status: 'online'
      }
    }
  )

  assert.equal(calls.leaveParticipant.length, 0)
  assert.equal(calls.addParticipant.length, 0)
  assert.equal(emitted.length, 0)
  assert.equal(result.channelId, 'voice-1')
  assert.equal(typeof result.token, 'string')
  assert.equal(result.participants.length, 1)
})

test('voice service: create still leaves old channel and joins new channel', async () => {
  const { service, calls, emitted } = createHarness({
    existingChannelId: 'voice-old'
  })

  const result = await service.create(
    { channel_id: 'voice-new' },
    {
      user: {
        id: 'user-self',
        display_name: 'Self User',
        avatar_url: null,
        status: 'online'
      }
    }
  )

  assert.deepEqual(calls.leaveParticipant, [{
    channelId: 'voice-old',
    userId: 'user-self'
  }])
  assert.equal(calls.addParticipant.length, 1)
  assert.deepEqual(calls.addParticipant[0], {
    id: 'vp-voice-new-user-self',
    channel_id: 'voice-new',
    user_id: 'user-self',
    is_muted: false,
    is_deafened: false,
    is_video_enabled: false
  })

  assert.equal(emitted.length, 2)
  assert.equal(emitted[0].event, 'participant-left')
  assert.equal(emitted[1].event, 'participant-joined')
  assert.equal(emitted[1].payload.participant.status, 'online')
  assert.equal(result.channelId, 'voice-new')
  assert.equal(result.participants[0].status, 'online')
})

test('voice service: meeting join payload enables camera feature when platform setting is enabled', async () => {
  const { service } = createHarness({
    channelPurpose: 'meeting',
    meetingVideoEnabled: 'true'
  })

  const result = await service.create(
    { channel_id: 'meeting-channel-video' },
    {
      user: {
        id: 'user-self',
        display_name: 'Self User',
        avatar_url: null,
        status: 'online'
      }
    }
  )

  assert.equal(result.features.meeting_video_enabled, true)
  assert.equal(result.participants[0].is_video_enabled, false)
})

test('voice service: regular voice channel payload never enables meeting video', async () => {
  const { service } = createHarness({
    channelPurpose: null,
    meetingVideoEnabled: 'true'
  })

  const result = await service.create(
    { channel_id: 'voice-channel-audio' },
    {
      user: {
        id: 'user-self',
        display_name: 'Self User',
        avatar_url: null,
        status: 'online'
      }
    }
  )

  assert.equal(result.features.meeting_video_enabled, false)
})

test('voice service: remove marks active meeting idle when room becomes empty', async () => {
  const { service, meetingState } = createHarness({
    leaveCleanupRoom: true,
    activeMeeting: {
      id: 'meeting-1',
      chat_channel_id: 'voice-meeting',
      status: 'active',
      empty_since: null
    }
  })

  const result = await service.remove('voice-meeting', {
    user: {
      id: 'user-self'
    }
  })

  assert.equal(result.left, true)
  assert.equal(typeof meetingState.empty_since, 'string')
})

test('voice service: create clears meeting idle marker when joining active meeting channel', async () => {
  const { service, meetingState } = createHarness({
    activeMeeting: {
      id: 'meeting-2',
      chat_channel_id: 'voice-meeting-2',
      status: 'active',
      empty_since: '2026-03-11T10:00:00.000Z'
    }
  })

  await service.create(
    { channel_id: 'voice-meeting-2' },
    {
      user: {
        id: 'user-self',
        display_name: 'Self User',
        avatar_url: null,
        status: 'online'
      }
    }
  )

  assert.equal(meetingState.empty_since, null)
})

test('voice service: meeting recording start is skipped while transcription recording is paused', () => {
  const { service } = createHarness()

  assert.equal(service._shouldStartMeetingRecording({
    id: 'meeting-paused',
    transcription_recording_status: 'paused'
  }), false)
  assert.equal(service._shouldStartMeetingRecording({
    id: 'meeting-active',
    transcription_recording_status: 'active'
  }), true)
})
