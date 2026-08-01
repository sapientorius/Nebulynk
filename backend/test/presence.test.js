import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearAutoAwayState,
  DEFAULT_AUTO_AWAY_MS,
  getAutoAwayTimeoutMs,
  isAutoAwayUser,
  resetPresenceStateForTests,
  runAutoAwaySweep,
  setupPresence,
  updateConnectionPresenceState
} from '../src/presence.js'

function projectColumns(row, columns = []) {
  if (!row) return null
  if (!Array.isArray(columns) || columns.length === 0) {
    return { ...row }
  }

  return Object.fromEntries(columns.map((column) => [column, row[column]]))
}

function createDbStub({ initialUserStatuses = {}, autoAwayMinutes = '15', activeVoiceUserIds = [] } = {}) {
  const userStatuses = new Map(Object.entries(initialUserStatuses))

  const db = (table) => {
    if (table === 'users') {
      const builder = {
        _where: null,
        _whereIn: null,
        where(column, value) {
          builder._where = { column, value }
          return builder
        },
        whereIn(column, values) {
          builder._whereIn = { column, values }
          return builder
        },
        async select(...columns) {
          if (builder._whereIn?.column === 'id') {
            return builder._whereIn.values.map((id) => projectColumns({
              id,
              status: userStatuses.get(id) || 'offline'
            }, columns))
          }

          if (builder._where?.column === 'id') {
            return [projectColumns({
              id: builder._where.value,
              status: userStatuses.get(builder._where.value) || 'offline'
            }, columns)]
          }

          return []
        },
        async first(...columns) {
          if (builder._where?.column === 'id') {
            return projectColumns({
              id: builder._where.value,
              status: userStatuses.get(builder._where.value) || 'offline'
            }, columns)
          }

          return null
        }
      }

      return builder
    }

    if (table === 'platform_settings') {
      return {
        where(column, value) {
          return {
            async first() {
              if (column === 'key' && value === 'auto_away_minutes') {
                return { key: value, value: autoAwayMinutes }
              }

              return null
            }
          }
        }
      }
    }

    if (table === 'voice_participants') {
      const builder = {
        _whereIn: null,
        whereIn(column, values) {
          builder._whereIn = { column, values }
          return builder
        },
        async distinct(column) {
          return (builder._whereIn?.values || [])
            .filter((userId) => activeVoiceUserIds.includes(userId))
            .map((userId) => ({ [column]: userId }))
        }
      }

      return builder
    }

    throw new Error(`Unexpected table: ${table}`)
  }

  return {
    db,
    userStatuses
  }
}

function createAppHarness(options = {}) {
  const { db, userStatuses } = createDbStub(options)
  const patches = []
  const handlers = new Map()
  const app = {
    get(key) {
      if (key !== 'postgresqlClient') {
        throw new Error(`Unexpected app.get(${key})`)
      }
      return db
    },
    service(name) {
      if (name !== 'users') {
        throw new Error(`Unexpected service(${name})`)
      }

      return {
        async patch(userId, payload, params = {}) {
          patches.push({ userId, payload, params })
          if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
            userStatuses.set(userId, payload.status)
          }
          return { id: userId, ...payload }
        }
      }
    },
    on(eventName, handler) {
      handlers.set(eventName, handler)
    },
    channel() {
      return {
        send() {}
      }
    }
  }

  return {
    app,
    patches,
    handlers,
    userStatuses
  }
}

test.afterEach(() => {
  resetPresenceStateForTests()
})

test('presence: auto-away uses the configured timeout and falls back to the default', async () => {
  const configured = createAppHarness({ autoAwayMinutes: '22' })
  const fallback = createAppHarness({ autoAwayMinutes: '0' })

  assert.equal(await getAutoAwayTimeoutMs(configured.app), 22 * 60 * 1000)
  assert.equal(await getAutoAwayTimeoutMs(fallback.app), DEFAULT_AUTO_AWAY_MS)
})

test('presence: idle online users are auto-set to away, but active voice users are skipped', async () => {
  const harness = createAppHarness({
    autoAwayMinutes: '15',
    initialUserStatuses: {
      'user-idle': 'online',
      'user-voice': 'online'
    },
    activeVoiceUserIds: ['user-voice']
  })
  setupPresence(harness.app)

  const login = harness.handlers.get('login')
  const idleConnection = { id: 'conn-idle' }
  const voiceConnection = { id: 'conn-voice' }

  await login({ user: { id: 'user-idle', display_name: 'Idle User' } }, { connection: idleConnection })
  await login({ user: { id: 'user-voice', display_name: 'Voice User' } }, { connection: voiceConnection })
  harness.patches.length = 0

  await updateConnectionPresenceState(harness.app, idleConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:00:00.000Z',
    lastActivityAt: '2026-03-31T09:00:00.000Z'
  })
  await updateConnectionPresenceState(harness.app, voiceConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:00:00.000Z',
    lastActivityAt: '2026-03-31T09:00:00.000Z'
  })

  const result = await runAutoAwaySweep(harness.app, {
    now: new Date('2026-03-31T09:16:00.000Z')
  })

  assert.equal(result.examined, 2)
  assert.equal(result.transitioned, 1)
  assert.deepEqual(harness.patches, [{
    userId: 'user-idle',
    payload: { status: 'away' },
    params: { autoAwayTransition: true }
  }])
  assert.equal(harness.userStatuses.get('user-idle'), 'away')
  assert.equal(harness.userStatuses.get('user-voice'), 'online')
  assert.equal(isAutoAwayUser('user-idle'), true)
  assert.equal(isAutoAwayUser('user-voice'), false)
})

test('presence: activity restores users from automatic away without touching manual away users', async () => {
  const harness = createAppHarness({
    autoAwayMinutes: '15',
    initialUserStatuses: {
      'user-auto': 'online',
      'user-manual': 'online'
    }
  })
  setupPresence(harness.app)

  const login = harness.handlers.get('login')
  const autoConnection = { id: 'conn-auto' }
  const manualConnection = { id: 'conn-manual' }

  await login({ user: { id: 'user-auto', display_name: 'Auto User' } }, { connection: autoConnection })
  await login({ user: { id: 'user-manual', display_name: 'Manual User' } }, { connection: manualConnection })

  await updateConnectionPresenceState(harness.app, autoConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:00:00.000Z',
    lastActivityAt: '2026-03-31T09:00:00.000Z'
  })
  await updateConnectionPresenceState(harness.app, manualConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:00:00.000Z',
    lastActivityAt: '2026-03-31T09:00:00.000Z'
  })

  harness.patches.length = 0
  await runAutoAwaySweep(harness.app, {
    now: new Date('2026-03-31T09:16:00.000Z')
  })

  assert.equal(isAutoAwayUser('user-auto'), true)
  assert.equal(isAutoAwayUser('user-manual'), true)

  clearAutoAwayState('user-manual')
  harness.userStatuses.set('user-manual', 'away')
  harness.patches.length = 0

  await updateConnectionPresenceState(harness.app, autoConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:17:00.000Z',
    lastActivityAt: '2026-03-31T09:17:00.000Z'
  })

  await updateConnectionPresenceState(harness.app, manualConnection, {
    isVisible: true,
    updatedAt: '2026-03-31T09:17:00.000Z',
    lastActivityAt: '2026-03-31T09:17:00.000Z'
  })

  assert.deepEqual(harness.patches, [{
    userId: 'user-auto',
    payload: { status: 'online' },
    params: { autoAwayTransition: true }
  }])
})
