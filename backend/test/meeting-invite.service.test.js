import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { BadRequest } from '@feathersjs/errors'
import { hashMeetingInviteToken } from '../src/lib/meeting-invites.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'
import { meetingInvite } from '../src/services/meeting-invite/meeting-invite.js'
import { MeetingInviteService } from '../src/services/meeting-invite/meeting-invite.js'

function normalizeFieldName(field) {
  return String(field || '').split('.').pop()
}

function createBuilder(rows) {
  const filters = []

  function applyFilters() {
    return rows.filter((row) => filters.every((filter) => filter(row)))
  }

  const builder = {
    where(keyOrObject, value) {
      if (typeof keyOrObject === 'object' && keyOrObject !== null) {
        filters.push((row) => Object.entries(keyOrObject).every(([key, expected]) => row[normalizeFieldName(key)] === expected))
        return builder
      }

      filters.push((row) => row[normalizeFieldName(keyOrObject)] === value)
      return builder
    },
    leftJoin() {
      return builder
    },
    select() {
      return builder
    },
    async first() {
      const [first] = applyFilters()
      return first ? { ...first } : undefined
    }
  }

  return builder
}

function createDb(initialState) {
  const state = {
    meeting_invite_links: (initialState.meeting_invite_links || []).map((row) => ({ ...row })),
    meetings: (initialState.meetings || []).map((row) => ({ ...row }))
  }

  const db = (table) => {
    const normalizedTable = table === 'meetings as meeting' ? 'meetings' : table
    if (!Object.prototype.hasOwnProperty.call(state, normalizedTable)) {
      throw new Error(`Unexpected table: ${table}`)
    }
    return createBuilder(state[normalizedTable])
  }

  db._state = state
  return db
}

function createRateLimitedMeetingInviteService({
  now = 1_000,
  token = 'meeting-token'
} = {}) {
  const app = feathers()
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now }))

  const db = (table) => {
    if (table === 'meetings as meeting') {
      return createBuilder([{
        id: 'meeting-1',
        status: 'active',
        source_channel_name: 'General',
        chat_channel_id: 'meeting-channel-1',
        source_channel_id: 'channel-1',
        title: 'Daily Sync',
        description: null,
        scheduled_start_at: null,
        scheduled_end_at: null,
        join_not_before: null
      }])
    }

    if (table === 'meeting_invite_links') {
      return createBuilder([{
        id: 'link-1',
        token_hash: hashMeetingInviteToken(token),
        meeting_id: 'meeting-1',
        revoked_at: null,
        expires_at: null,
        use_count: 0
      }])
    }

    if (table === 'platform_settings') {
      return createBuilder([])
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  db.raw = (value) => value
  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'meeting_participants') {
        return {
          where() {
            return this
          },
          async first() {
            return null
          },
          async insert() {}
        }
      }

      if (table === 'channel_members') {
        return {
          insert() {
            return this
          },
          onConflict() {
            return this
          },
          async ignore() {}
        }
      }

      if (table === 'meeting_invite_links') {
        return {
          where() {
            return this
          },
          async update() {}
        }
      }

      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  app.set('postgresqlClient', db)
  app.use('users', {
    async create() {
      return {
        id: 'guest-1',
        email: 'guest-1@guest.nebulynk.local',
        display_name: 'Guest One'
      }
    },
    async remove() {}
  })
  app.use('authentication', {
    async create() {
      return {
        accessToken: 'token-1',
        user: {
          id: 'guest-1',
          email: 'guest-1@guest.nebulynk.local',
          account_type: 'guest'
        }
      }
    }
  })
  app.use('meetings', {
    async get() {
      return {
        id: 'meeting-1',
        status: 'active',
        chat_channel_id: 'meeting-channel-1'
      }
    },
    emit() {}
  })

  meetingInvite(app)
  return app.service('meeting-invite')
}

test('meeting invite service: find rejects overdue scheduled meetings after normalization', async () => {
  const token = 'meeting-token'
  const normalizedMeetingIds = []
  const db = createDb({
    meeting_invite_links: [{
      id: 'link-1',
      token_hash: hashMeetingInviteToken(token),
      meeting_id: 'meeting-1',
      revoked_at: null,
      expires_at: null
    }],
    meetings: [{
      id: 'meeting-1',
      status: 'scheduled',
      scheduled_start_at: '2026-04-23T08:00:00.000Z',
      scheduled_end_at: '2026-04-23T09:00:00.000Z',
      source_channel_name: 'General'
    }]
  })
  const app = {
    get(key) {
      if (key === 'postgresqlClient') return db
      throw new Error(`Unexpected app.get key: ${key}`)
    }
  }

  const service = new MeetingInviteService(app, {
    async normalizeOverdueScheduledMeeting({ meeting }) {
      normalizedMeetingIds.push(meeting.id)
      const storedMeeting = db._state.meetings.find((entry) => entry.id === meeting.id)
      Object.assign(storedMeeting, {
        status: 'ended',
        ended_at: storedMeeting.scheduled_end_at
      })
    }
  })

  await assert.rejects(
    service.find({ query: { token } }),
    (error) => error instanceof BadRequest && error.error_code === 'api.meeting_invite.ended'
  )

  assert.deepEqual(normalizedMeetingIds, ['meeting-1'])
})

test('meeting invite service: create emits a meetings joined event for guest acceptance', async () => {
  const token = 'meeting-token'
  const insertedParticipants = []
  const insertedChannelMembers = []
  const updatedInviteLinks = []
  const emittedEvents = []
  const removedUsers = []
  const authenticationRequests = []

  const db = (table) => {
    if (table === 'meetings as meeting') {
      return createBuilder([{
        id: 'meeting-1',
        status: 'active',
        source_channel_name: 'General',
        chat_channel_id: 'meeting-channel-1'
      }])
    }

    if (table === 'meeting_invite_links') {
      return createBuilder([{
        id: 'link-1',
        token_hash: hashMeetingInviteToken(token),
        meeting_id: 'meeting-1',
        revoked_at: null,
        expires_at: null
      }])
    }

    if (table === 'platform_settings') {
      return createBuilder([])
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  db.raw = (value) => value
  db.transaction = async (callback) => {
    const trx = (table) => {
      if (table === 'meeting_participants') {
        return {
          where() {
            return this
          },
          async first() {
            return null
          },
          async insert(payload) {
            insertedParticipants.push(payload)
          }
        }
      }

      if (table === 'channel_members') {
        return {
          insert(payload) {
            insertedChannelMembers.push(payload)
            return this
          },
          onConflict() {
            return this
          },
          async ignore() {}
        }
      }

      if (table === 'meeting_invite_links') {
        return {
          where() {
            return this
          },
          async update(payload) {
            updatedInviteLinks.push(payload)
          }
        }
      }

      throw new Error(`Unexpected trx table: ${table}`)
    }

    return callback(trx)
  }

  const app = {
    get(key) {
      if (key === 'postgresqlClient') return db
      throw new Error(`Unexpected app.get key: ${key}`)
    },
    service(name) {
      if (name === 'users') {
        return {
          async create() {
            return {
              id: 'guest-1',
              email: 'guest-1@guest.nebulynk.local',
              display_name: 'Gast Eins'
            }
          },
          async remove(userId) {
            removedUsers.push(userId)
          }
        }
      }

      if (name === 'authentication') {
        return {
          async create(data) {
            authenticationRequests.push(data)
            return {
              accessToken: 'token-1',
              user: {
                id: 'guest-1',
                email: 'guest-1@guest.nebulynk.local',
                account_type: 'guest'
              }
            }
          }
        }
      }

      if (name === 'meetings') {
        return {
          async get() {
            return {
              id: 'meeting-1',
              status: 'active',
              chat_channel_id: 'meeting-channel-1'
            }
          },
          emit(eventName, payload) {
            emittedEvents.push({ eventName, payload })
          }
        }
      }

      throw new Error(`Unexpected service: ${name}`)
    }
  }

  const service = new MeetingInviteService(app)
  const result = await service.create({
    token,
    display_name: 'Gast Eins'
  })

  assert.equal(result.user.id, 'guest-1')
  assert.equal(insertedParticipants.length, 1)
  assert.equal(insertedParticipants[0].meeting_id, 'meeting-1')
  assert.equal(insertedParticipants[0].user_id, 'guest-1')
  assert.equal(insertedParticipants[0].invite_status, 'joined')
  assert.equal(insertedChannelMembers.length, 1)
  assert.equal(insertedChannelMembers[0].channel_id, 'meeting-channel-1')
  assert.equal(updatedInviteLinks.length, 1)
  assert.deepEqual(removedUsers, [])
  assert.deepEqual(authenticationRequests, [{
    strategy: 'local',
    email: 'guest-1@guest.nebulynk.local',
    password: authenticationRequests[0].password,
    session_mode: 'browser'
  }])
  assert.deepEqual(emittedEvents, [{
    eventName: 'joined',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'meeting-channel-1',
      userId: 'guest-1',
      participantUserId: 'guest-1',
      status: 'active'
    }
  }])
})

test('meeting invite service hooks: find is rate-limited for repeated public token lookups', async () => {
  const service = createRateLimitedMeetingInviteService()
  const params = {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.30' },
    query: { token: 'meeting-token' }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await service.find(params)
  }

  await assert.rejects(
    service.find(params),
    (error) => {
      assert.equal(error.error_code, 'api.meeting_invite.rate_limited')
      assert.equal(error.data?.error_params?.retry_after_seconds, 600)
      return true
    }
  )
})

test('meeting invite service hooks: create is rate-limited for repeated public guest joins', async () => {
  const service = createRateLimitedMeetingInviteService()
  const data = {
    token: 'meeting-token',
    display_name: 'Guest One'
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const params = {
      provider: 'rest',
      headers: { 'x-forwarded-for': `203.0.113.${attempt + 31}` }
    }
    const result = await service.create(data, params)
    assert.equal(result.user.id, 'guest-1')
  }

  await assert.rejects(
    service.create(data, {
      provider: 'rest',
      headers: { 'x-forwarded-for': '203.0.113.99' }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.meeting_invite.rate_limited')
      assert.equal(error.data?.error_params?.retry_after_seconds, 600)
      return true
    }
  )
})
