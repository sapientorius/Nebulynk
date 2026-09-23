import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { createNotificationSideEffectsDispatcher } from '../src/lib/notification-side-effects.js'

test('flush and stop wait for an already active push batch and all queued batches', async () => {
  const gate = Promise.withResolvers()
  const entered = Promise.withResolvers()
  const pushed = []
  const dispatcher = createNotificationSideEffectsDispatcher({
    get: () => createUsersDb([{ id: 'u', status: 'online' }]),
    service: () => ({ emit() {} })
  }, {
    hasVisibleSession: () => false,
    async sendPush() { entered.resolve(); await gate.promise; pushed.push('push') }
  })
  dispatcher.enqueue([{ id: 'one', user_id: 'u' }])
  await entered.promise
  dispatcher.enqueue([{ id: 'two', user_id: 'u' }])
  let flushed = false
  const flush = dispatcher.flush().then(() => { flushed = true })
  const stop = dispatcher.stop()
  await delay(0)
  assert.equal(flushed, false)
  assert.throws(() => dispatcher.enqueue([{ id: 'late' }]), /stopped/)
  gate.resolve()
  await Promise.all([flush, stop])
  assert.equal(pushed.length, 2)
  await dispatcher.stop()
})

function createUsersDb(users = []) {
  return createTestDb({ users })
}

function createTestDb({ users = [], notifications = [] } = {}) {
  return (table) => {
    if (table === 'notifications') {
      const builder = {
        _userIds: [],
        _isRead: undefined,
        whereIn(column, values) {
          if (column !== 'user_id') {
            throw new Error(`Unexpected whereIn column: ${column}`)
          }
          builder._userIds = values
          return builder
        },
        where(column, value) {
          if (column !== 'is_read') {
            throw new Error(`Unexpected where column: ${column}`)
          }
          builder._isRead = value
          return builder
        },
        groupBy(column) {
          if (column !== 'user_id') {
            throw new Error(`Unexpected groupBy column: ${column}`)
          }
          return builder
        },
        select(...columns) {
          if (columns.length !== 1 || columns[0] !== 'user_id') {
            throw new Error(`Unexpected notification select columns: ${columns.join(',')}`)
          }
          return builder
        },
        async count(alias) {
          if (alias?.count !== '*') {
            throw new Error(`Unexpected count alias: ${JSON.stringify(alias)}`)
          }
          const counts = new Map()
          for (const notification of notifications) {
            if (!builder._userIds.includes(notification.user_id)) continue
            if (notification.is_read !== builder._isRead) continue
            counts.set(notification.user_id, (counts.get(notification.user_id) || 0) + 1)
          }
          return [...counts.entries()].map(([user_id, count]) => ({
            user_id,
            count: String(count)
          }))
        }
      }

      return builder
    }

    if (table !== 'users') {
      throw new Error(`Unexpected table: ${table}`)
    }

    const builder = {
      _ids: [],
      whereIn(column, values) {
        if (column !== 'id') {
          throw new Error(`Unexpected whereIn column: ${column}`)
        }
        builder._ids = values
        return builder
      },
      async select(...columns) {
        return users
          .filter((user) => builder._ids.includes(user.id))
          .map((user) => {
            const selected = {}
            for (const column of columns) {
              selected[column] = user[column]
            }
            return selected
          })
      }
    }

    return builder
  }
}

test('notification side effects dispatcher schedules socket and push work off the enqueue call', async () => {
  const emitted = []
  const pushed = []
  const scheduledTasks = []

  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createTestDb({
        users: [
          { id: 'user-1', status: 'online', preferred_locale: 'en' }
        ],
        notifications: [
          { user_id: 'user-1', is_read: false },
          { user_id: 'user-1', is_read: false },
          { user_id: 'user-1', is_read: true }
        ]
      })
    },
    service(name) {
      if (name !== 'notifications') throw new Error(`Unexpected service(${name})`)
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId, payload) => {
      pushed.push({ userId, payload })
    },
    hasVisibleSession: () => false,
    schedule(task) {
      scheduledTasks.push(task)
    }
  })

  dispatcher.enqueue([{
    id: 'notification-1',
    user_id: 'user-1',
    type: 'mention',
    channel_id: 'channel-1',
    actor_display_name: 'Alice',
    message_snippet: 'hello'
  }])

  assert.equal(emitted.length, 0)
  assert.equal(pushed.length, 0)
  assert.equal(scheduledTasks.length, 1)

  await scheduledTasks[0]()
  await dispatcher.flush()

  assert.deepEqual(emitted, [{
    eventName: 'created',
    payload: {
      id: 'notification-1',
      user_id: 'user-1',
      type: 'mention',
      channel_id: 'channel-1',
      actor_display_name: 'Alice',
      message_snippet: 'hello'
    }
  }])
  assert.equal(pushed.length, 1)
  assert.equal(pushed[0].userId, 'user-1')
  assert.equal(pushed[0].payload.url, '/channels/channel-1')
  assert.equal(pushed[0].payload.unreadCount, 2)
})

test('notification side effects dispatcher skips dnd push and swallows socket/push failures', async () => {
  const emitted = []
  const pushed = []
  const logEntries = []

  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createUsersDb([
        { id: 'user-1', status: 'dnd', preferred_locale: 'de' },
        { id: 'user-2', status: 'online', preferred_locale: 'en' }
      ])
    },
    service(name) {
      if (name !== 'notifications') throw new Error(`Unexpected service(${name})`)
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
          if (payload.user_id === 'user-1') {
            throw new Error('socket broke')
          }
        }
      }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId) => {
      pushed.push(userId)
      throw new Error('push broke')
    },
    hasVisibleSession: () => false,
    log: {
      error(message, meta) {
        logEntries.push({ message, meta })
      }
    },
    schedule(task) {
      task()
    }
  })

  dispatcher.enqueue([
    {
      id: 'notification-1',
      user_id: 'user-1',
      type: 'mention',
      channel_id: 'channel-1',
      actor_display_name: 'Alice',
      message_snippet: 'hello'
    },
    {
      id: 'notification-2',
      user_id: 'user-2',
      type: 'dm_message',
      channel_id: 'channel-9',
      actor_display_name: 'Alice',
      message_snippet: 'direct'
    }
  ])

  await dispatcher.flush()

  assert.deepEqual(emitted.map((entry) => entry.payload.id), ['notification-1', 'notification-2'])
  assert.deepEqual(pushed, ['user-2'])
  assert.equal(logEntries.some((entry) => entry.message === 'Failed to send notification via socket'), true)
  assert.equal(logEntries.some((entry) => entry.message === 'Failed to send notification push'), true)
  assert.equal(emitted.some((entry) => entry.payload.user_id === 'user-1'), true)
})

test('notification side effects dispatcher suppresses push when the matching channel is visible in the foreground', async () => {
  const pushed = []

  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createUsersDb([
        { id: 'user-1', status: 'online', preferred_locale: 'en' }
      ])
    },
    service(name) {
      if (name !== 'notifications') throw new Error(`Unexpected service(${name})`)
      return {
        emit() {}
      }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId, payload) => {
      pushed.push({ userId, payload })
    },
    hasVisibleSession: (userId, channelId) => userId === 'user-1' && channelId === 'channel-visible',
    schedule(task) {
      task()
    }
  })

  dispatcher.enqueue([{
    id: 'notification-foreground-1',
    user_id: 'user-1',
    type: 'dm_message',
    channel_id: 'channel-visible',
    actor_display_name: 'Alice',
    message_snippet: 'hello there'
  }])

  await dispatcher.flush()

  assert.deepEqual(pushed, [])
})

test('notification side effects dispatcher still pushes when the user is foregrounded in a different channel or hidden', async () => {
  const pushed = []

  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createUsersDb([
        { id: 'user-1', status: 'online', preferred_locale: 'en' }
      ])
    },
    service(name) {
      if (name !== 'notifications') throw new Error(`Unexpected service(${name})`)
      return {
        emit() {}
      }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId, payload) => {
      pushed.push({ userId, payload })
    },
    hasVisibleSession: (_userId, channelId) => channelId === 'channel-other-visible',
    schedule(task) {
      task()
    }
  })

  dispatcher.enqueue([
    {
      id: 'notification-foreground-2',
      user_id: 'user-1',
      type: 'mention',
      channel_id: 'channel-target',
      actor_display_name: 'Alice',
      message_snippet: 'target channel'
    },
    {
      id: 'notification-foreground-3',
      user_id: 'user-1',
      type: 'mention',
      channel_id: 'channel-hidden',
      actor_display_name: 'Alice',
      message_snippet: 'hidden channel'
    }
  ])

  await dispatcher.flush()

  assert.equal(pushed.length, 2)
  assert.deepEqual(pushed.map((entry) => entry.payload.url), [
    '/channels/channel-target',
    '/channels/channel-hidden'
  ])
})

test('notification side effects dispatcher deep-links message notifications and does not foreground-suppress reminders', async () => {
  const pushed = []

  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createUsersDb([
        { id: 'user-1', status: 'online', preferred_locale: 'de' }
      ])
    },
    service(name) {
      if (name !== 'notifications') throw new Error(`Unexpected service(${name})`)
      return {
        emit() {}
      }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId, payload) => {
      pushed.push({ userId, payload })
    },
    hasVisibleSession: () => true,
    schedule(task) {
      task()
    }
  })

  dispatcher.enqueue([{
    id: 'notification-reminder-1',
    user_id: 'user-1',
    type: 'message_reminder',
    channel_id: 'channel-visible',
    message_id: 'message-1',
    actor_display_name: 'Erinnerung',
    message_snippet: 'remember this'
  }])

  await dispatcher.flush()

  assert.equal(pushed.length, 1)
  assert.equal(pushed[0].payload.title, 'Erinnerung')
  assert.equal(pushed[0].payload.url, '/channels/channel-visible?message=message-1')
})

test('notification side effects dispatcher routes registration alerts to registration settings', async () => {
  const pushed = []
  const app = {
    get(key) {
      if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
      return createUsersDb([
        { id: 'user-1', status: 'online', preferred_locale: 'en' }
      ])
    },
    service() {
      return { emit() {} }
    }
  }

  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    sendPush: async (_app, userId, payload) => {
      pushed.push({ userId, payload })
    },
    hasVisibleSession: () => false,
    schedule(task) {
      task()
    }
  })

  dispatcher.enqueue([{
    id: 'notification-registration-1',
    user_id: 'user-1',
    type: 'registration_pending',
    actor_display_name: 'New Member',
    message_snippet: 'New Member has registered and is awaiting approval.'
  }])

  await dispatcher.flush()

  assert.deepEqual(pushed, [{
    userId: 'user-1',
    payload: {
      title: 'Registration awaiting approval',
      body: 'New Member has registered and is awaiting approval.',
      url: '/admin?tab=registration',
      unreadCount: 0
    }
  }])
})
