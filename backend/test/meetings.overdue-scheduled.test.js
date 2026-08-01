import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest } from '@feathersjs/errors'
import { autoEndOverdueScheduledMeeting, endOverdueScheduledMeetings } from '../src/services/meetings/overdue-scheduled.js'
import { createMeetingsService } from './helpers/meetings-service.js'

function normalizeFieldName(field) {
  return String(field || '').split('.').pop()
}

function createBuilder(rows) {
  const filters = []

  function applyFilters() {
    return rows.filter((row) => filters.every((filter) => filter(row)))
  }

  const builder = {
    where(keyOrObject, operatorOrValue, maybeValue) {
      if (typeof keyOrObject === 'object' && keyOrObject !== null) {
        filters.push((row) => Object.entries(keyOrObject).every(([key, value]) => row[normalizeFieldName(key)] === value))
        return builder
      }

      const key = normalizeFieldName(keyOrObject)
      if (arguments.length === 2) {
        filters.push((row) => row[key] === operatorOrValue)
        return builder
      }

      if (operatorOrValue === '<=') {
        filters.push((row) => row[key] != null && row[key] <= maybeValue)
        return builder
      }

      throw new Error(`Unsupported where operator: ${operatorOrValue}`)
    },
    whereNull(key) {
      const normalized = normalizeFieldName(key)
      filters.push((row) => row[normalized] == null)
      return builder
    },
    whereNotNull(key) {
      const normalized = normalizeFieldName(key)
      filters.push((row) => row[normalized] != null)
      return builder
    },
    leftJoin() {
      return builder
    },
    select(...fields) {
      return Promise.resolve(applyFilters().map((row) => {
        if (fields.length === 0) return { ...row }
        const selected = {}
        for (const field of fields) {
          selected[normalizeFieldName(field)] = row[normalizeFieldName(field)]
        }
        return selected
      }))
    },
    async first() {
      const [first] = applyFilters()
      return first ? { ...first } : undefined
    },
    async update(values) {
      let count = 0
      for (const row of rows) {
        if (!filters.every((filter) => filter(row))) continue
        Object.assign(row, values)
        count += 1
      }
      return count
    }
  }

  return builder
}

function createDb(initialState = {}) {
  const state = {
    meetings: (initialState.meetings || []).map((row) => ({ ...row })),
    channels: (initialState.channels || []).map((row) => ({ ...row })),
    meeting_invite_links: (initialState.meeting_invite_links || []).map((row) => ({ ...row }))
  }

  const db = (table) => {
    const normalizedTable = table === 'meetings as meeting' ? 'meetings' : table
    if (!Object.prototype.hasOwnProperty.call(state, normalizedTable)) {
      throw new Error(`Unexpected table: ${table}`)
    }
    return createBuilder(state[normalizedTable])
  }

  db.transaction = async (callback) => callback((table) => db(table))
  db._state = state
  return db
}

function createApp({ db, emitted = [] }) {
  return {
    get(key) {
      if (key === 'postgresqlClient') return db
      throw new Error(`Unexpected app.get key: ${key}`)
    },
    service(name) {
      return {
        emit(eventName, payload) {
          emitted.push({ service: name, eventName, payload })
        }
      }
    }
  }
}

test('meetings overdue scheduled: auto-end converts scheduled meeting into ended and revokes guest links', async () => {
  const now = new Date('2026-04-23T10:00:00.000Z')
  const emitted = []
  const artifactOps = []
  const db = createDb({
    meetings: [{
      id: 'meeting-1',
      status: 'scheduled',
      scheduled_end_at: '2026-04-23T09:00:00.000Z',
      chat_channel_id: 'chat-1',
      source_channel_id: 'source-1',
      ended_at: null,
      ended_by: 'host-1',
      updated_at: null
    }],
    channels: [{
      id: 'chat-1',
      is_archived: false,
      archived_at: null,
      archived_by: 'host-1',
      updated_at: null
    }],
    meeting_invite_links: [{
      id: 'link-1',
      meeting_id: 'meeting-1',
      revoked_at: null,
      updated_at: null
    }]
  })
  const app = createApp({ db, emitted })
  const artifactDomainService = {
    async resolveEndedMeetingArtifactTypes() {
      return ['summary']
    },
    async queueProcessingArtifacts(trx, payload) {
      artifactOps.push({ trx: !!trx, payload })
    },
    emitArtifactsQueued(meeting, payload) {
      emitted.push({ service: 'meetings', eventName: 'artifacts-queued', payload: { meeting, ...payload } })
    }
  }

  const ended = await autoEndOverdueScheduledMeeting({
    app,
    db,
    meeting: db._state.meetings[0],
    now,
    artifactDomainService
  })

  assert.equal(ended, true)
  assert.equal(db._state.meetings[0].status, 'ended')
  assert.equal(db._state.meetings[0].ended_at, '2026-04-23T09:00:00.000Z')
  assert.equal(db._state.meetings[0].ended_by, null)
  assert.equal(db._state.channels[0].is_archived, true)
  assert.equal(db._state.channels[0].archived_at, '2026-04-23T09:00:00.000Z')
  assert.equal(db._state.channels[0].archived_by, null)
  assert.equal(db._state.meeting_invite_links[0].revoked_at, now.toISOString())
  assert.equal(artifactOps.length, 1)
  assert.deepEqual(artifactOps[0].payload, {
    meetingId: 'meeting-1',
    artifactTypes: ['summary'],
    nowIso: now.toISOString(),
    resetPayload: true
  })
  assert.deepEqual(emitted[1], {
    service: 'meetings',
    eventName: 'ended',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      endedAt: '2026-04-23T09:00:00.000Z',
      endedBy: null,
      status: 'ended',
      chatChannelArchived: true,
      reason: 'auto_end_scheduled_window_elapsed'
    }
  })
})

test('meetings overdue scheduled: sweep only ends scheduled meetings with elapsed end times', async () => {
  const now = new Date('2026-04-23T10:00:00.000Z')
  const db = createDb({
    meetings: [
      {
        id: 'meeting-overdue',
        status: 'scheduled',
        scheduled_end_at: '2026-04-23T09:00:00.000Z',
        chat_channel_id: 'chat-1',
        source_channel_id: 'source-1'
      },
      {
        id: 'meeting-open',
        status: 'scheduled',
        scheduled_end_at: null,
        chat_channel_id: 'chat-2',
        source_channel_id: 'source-2'
      },
      {
        id: 'meeting-live',
        status: 'active',
        scheduled_end_at: '2026-04-23T08:00:00.000Z',
        chat_channel_id: 'chat-3',
        source_channel_id: 'source-3'
      }
    ],
    channels: [
      { id: 'chat-1', is_archived: false, archived_at: null, archived_by: null },
      { id: 'chat-2', is_archived: false, archived_at: null, archived_by: null },
      { id: 'chat-3', is_archived: false, archived_at: null, archived_by: null }
    ],
    meeting_invite_links: []
  })
  const app = createApp({ db })

  const result = await endOverdueScheduledMeetings(app, {
    now,
    artifactDomainService: {
      async resolveEndedMeetingArtifactTypes() {
        return []
      },
      async queueProcessingArtifacts() {},
      emitArtifactsQueued() {}
    }
  })

  assert.deepEqual(result, {
    checkedCount: 1,
    endedCount: 1,
    skippedByRace: 0
  })
  assert.equal(db._state.meetings[0].status, 'ended')
  assert.equal(db._state.meetings[1].status, 'scheduled')
  assert.equal(db._state.meetings[2].status, 'active')
})

test('meetings overdue scheduled: join rejects meetings that normalized to ended', async () => {
  const service = createMeetingsService()
  service._getNormalizedMeetingOrThrow = async () => ({
    id: 'meeting-join',
    status: 'ended',
    chat_channel_id: 'chat-1',
    host_user_id: 'host-1'
  })

  await assert.rejects(
    service.join('meeting-join', {}, {
      user: { id: 'user-1', is_admin: false },
      provider: 'rest'
    }),
    BadRequest
  )
})
