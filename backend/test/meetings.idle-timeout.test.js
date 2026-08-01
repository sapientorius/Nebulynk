import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IDLE_MEETING_END_REASON,
  clearMeetingIdleByChatChannelId,
  endExpiredIdleMeetings,
  markMeetingIdleByChatChannelId
} from '../src/services/meetings/idle-timeout.js'

function createDb(initialState = {}) {
  const state = {
    meetings: (initialState.meetings || []).map((row) => ({ ...row })),
    voice_participants: (initialState.voice_participants || []).map((row) => ({ ...row }))
  }

  const db = (table) => {
    if (!Object.prototype.hasOwnProperty.call(state, table)) {
      throw new Error(`Unexpected table: ${table}`)
    }
    return createBuilder(state[table])
  }

  db._state = state
  return db
}

function createBuilder(rows) {
  const filters = []

  function applyFilters() {
    return rows.filter((row) => filters.every((filter) => filter(row)))
  }

  const builder = {
    where(keyOrObject, operatorOrValue, maybeValue) {
      if (typeof keyOrObject === 'object' && keyOrObject !== null) {
        filters.push((row) => Object.entries(keyOrObject).every(([key, value]) => row[key] === value))
        return builder
      }

      if (typeof keyOrObject !== 'string') {
        throw new Error('Unsupported where clause')
      }

      if (arguments.length === 2) {
        filters.push((row) => row[keyOrObject] === operatorOrValue)
        return builder
      }

      if (operatorOrValue === '<=') {
        filters.push((row) => row[keyOrObject] != null && row[keyOrObject] <= maybeValue)
        return builder
      }

      throw new Error(`Unsupported where operator: ${operatorOrValue}`)
    },
    whereNull(key) {
      filters.push((row) => row[key] == null)
      return builder
    },
    whereNotNull(key) {
      filters.push((row) => row[key] != null)
      return builder
    },
    async select(...fields) {
      return applyFilters().map((row) => {
        if (fields.length === 0) return { ...row }
        const out = {}
        for (const field of fields) {
          out[field] = row[field]
        }
        return out
      })
    },
    async first() {
      const [first] = applyFilters()
      return first ? { ...first } : undefined
    },
    async update(values) {
      let count = 0
      for (const row of rows) {
        if (filters.every((filter) => filter(row))) {
          Object.assign(row, values)
          count += 1
        }
      }
      return count
    },
    count(aliasMap) {
      const [alias] = Object.keys(aliasMap || { count: '*' })
      return {
        async first() {
          return { [alias]: String(applyFilters().length) }
        }
      }
    }
  }

  return builder
}

function createApp({ db, patches = [] }) {
  return {
    get(key) {
      if (key === 'postgresqlClient') return db
      throw new Error(`Unexpected app.get key: ${key}`)
    },
    service(name) {
      if (name !== 'meetings') {
        throw new Error(`Unexpected service: ${name}`)
      }
      return {
        async patch(...args) {
          patches.push(args)
          return { ok: true }
        }
      }
    }
  }
}

test('meetings idle timeout: markMeetingIdleByChatChannelId sets empty_since only once', async () => {
  const now = new Date('2026-03-11T11:00:00.000Z')
  const db = createDb({
    meetings: [{
      id: 'meeting-1',
      status: 'active',
      chat_channel_id: 'chat-1',
      empty_since: null,
      updated_at: null
    }]
  })
  const app = createApp({ db })

  const first = await markMeetingIdleByChatChannelId(app, 'chat-1', now)
  const second = await markMeetingIdleByChatChannelId(app, 'chat-1', new Date('2026-03-11T11:02:00.000Z'))

  assert.equal(first, true)
  assert.equal(second, false)
  assert.equal(db._state.meetings[0].empty_since, now.toISOString())
})

test('meetings idle timeout: clearMeetingIdleByChatChannelId clears empty_since for active meeting', async () => {
  const now = new Date('2026-03-11T12:00:00.000Z')
  const db = createDb({
    meetings: [{
      id: 'meeting-2',
      status: 'active',
      chat_channel_id: 'chat-2',
      empty_since: '2026-03-11T11:45:00.000Z',
      updated_at: null
    }]
  })
  const app = createApp({ db })

  const cleared = await clearMeetingIdleByChatChannelId(app, 'chat-2', now)

  assert.equal(cleared, true)
  assert.equal(db._state.meetings[0].empty_since, null)
  assert.equal(db._state.meetings[0].updated_at, now.toISOString())
})

test('meetings idle timeout: endExpiredIdleMeetings ends expired idle meetings and skips channels with participants', async () => {
  const now = new Date('2026-03-11T13:00:00.000Z')
  const patches = []
  const db = createDb({
    meetings: [
      {
        id: 'meeting-end',
        status: 'active',
        chat_channel_id: 'chat-end',
        host_user_id: 'host-1',
        empty_since: '2026-03-11T12:40:00.000Z',
        updated_at: null
      },
      {
        id: 'meeting-keep',
        status: 'active',
        chat_channel_id: 'chat-keep',
        host_user_id: 'host-2',
        empty_since: '2026-03-11T12:35:00.000Z',
        updated_at: null
      },
      {
        id: 'meeting-recent',
        status: 'active',
        chat_channel_id: 'chat-recent',
        host_user_id: 'host-3',
        empty_since: '2026-03-11T12:55:00.000Z',
        updated_at: null
      }
    ],
    voice_participants: [
      {
        channel_id: 'chat-keep',
        user_id: 'user-1'
      }
    ]
  })
  const app = createApp({ db, patches })

  const result = await endExpiredIdleMeetings(app, {
    now,
    idleTimeoutMs: 10 * 60 * 1000
  })

  assert.equal(result.checkedCount, 2)
  assert.equal(result.endedCount, 1)
  assert.equal(result.skippedByRace, 1)
  assert.equal(patches.length, 1)

  const [meetingId, payload, params] = patches[0]
  assert.equal(meetingId, 'meeting-end')
  assert.deepEqual(payload, {
    action: 'end',
    reason: IDLE_MEETING_END_REASON
  })
  assert.deepEqual(params.user, {
    id: 'host-1',
    is_admin: true
  })

  const keptMeeting = db._state.meetings.find((entry) => entry.id === 'meeting-keep')
  assert.equal(keptMeeting.empty_since, null)
})
