import test from 'node:test'
import assert from 'node:assert/strict'
import { buildNotificationsToInsert, createNotifications } from '../src/hooks/create-notifications.js'

function createDb(initialTables = {}) {
  const tables = Object.fromEntries(
    Object.entries(initialTables).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))])
  )

  function query(tableName) {
    const filters = []
    const whereIns = []
    const whereNots = []

    const getRows = () => {
      let rows = (tables[tableName] || []).map((row) => ({ ...row }))

      for (const [column, value] of filters) {
        rows = rows.filter((row) => row[column] === value)
      }

      for (const [column, values] of whereIns) {
        rows = rows.filter((row) => values.includes(row[column]))
      }

      for (const [column, value] of whereNots) {
        rows = rows.filter((row) => row[column] !== value)
      }

      return rows
    }

    const builder = {
      where(column, value) {
        filters.push([column, value])
        return builder
      },
      whereIn(column, values) {
        whereIns.push([column, values])
        return builder
      },
      whereNot(column, value) {
        whereNots.push([column, value])
        return builder
      },
      async first() {
        return getRows()[0] || null
      },
      async select(...columns) {
        const rows = getRows()
        if (columns.length === 0) return rows
        return rows.map((row) => {
          const selected = {}
          for (const column of columns) {
            selected[column] = row[column]
          }
          return selected
        })
      },
      async insert(rows) {
        const nextRows = Array.isArray(rows) ? rows : [rows]
        if (!tables[tableName]) tables[tableName] = []
        tables[tableName].push(...nextRows.map((row) => ({ ...row })))
        return nextRows.length
      },
      then(resolve, reject) {
        return Promise.resolve(getRows()).then(resolve, reject)
      }
    }

    return builder
  }

  query.tables = tables
  return query
}

test('createNotifications hook: skipNotifications exits before touching persistence', async () => {
  let getCalled = false
  const context = {
    params: {
      skipNotifications: true
    },
    app: {
      get() {
        getCalled = true
        throw new Error('should not access app.get when notifications are skipped')
      }
    },
    result: {
      id: 'message-1'
    }
  }

  const returned = await createNotifications(context)

  assert.equal(returned, context)
  assert.equal(getCalled, false)
})

test('buildNotificationsToInsert builds deduplicated mention and broadcast notifications with preference filtering', async () => {
  const db = createDb({
    channels: [
      { id: 'channel-1', type: 'public' }
    ],
    channel_members: [
      { channel_id: 'channel-1', user_id: 'user-2', notifications: 'all' },
      { channel_id: 'channel-1', user_id: 'user-3', notifications: 'none' },
      { channel_id: 'channel-1', user_id: 'user-4', notifications: 'mentions' }
    ]
  })

  const notifications = await buildNotificationsToInsert({
    app: {
      get(key) {
        if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
        return db
      }
    },
    params: {
      user: { id: 'user-1', display_name: 'Alice' }
    },
    result: {
      id: 'message-1',
      channel_id: 'channel-1',
      content: 'Hello @Bob @all',
      mentions: [
        { type: 'user', user_id: 'user-2' },
        { type: 'user', user_id: 'user-3' },
        { type: 'all', user_id: null }
      ]
    }
  })

  assert.equal(notifications.length, 2)
  assert.deepEqual(
    notifications.map((notification) => [notification.user_id, notification.type]),
    [
      ['user-2', 'mention'],
      ['user-4', 'mention_all']
    ]
  )
})

test('createNotifications persists rows and enqueues side effects without emitting inline', async () => {
  const db = createDb({
    channels: [
      { id: 'channel-1', type: 'public' }
    ],
    channel_members: [
      { channel_id: 'channel-1', user_id: 'user-2', notifications: 'all' }
    ]
  })

  const enqueuedBatches = []
  const context = {
    app: {
      get(key) {
        if (key === 'postgresqlClient') return db
        if (key === 'notificationSideEffectsDispatcher') {
          return {
            enqueue(batch) {
              enqueuedBatches.push(batch.map((row) => ({ ...row })))
            }
          }
        }
        throw new Error(`Unexpected app.get(${key})`)
      }
    },
    params: {
      user: { id: 'user-1', display_name: 'Alice' }
    },
    result: {
      id: 'message-1',
      channel_id: 'channel-1',
      content: 'Ping @Bob',
      mentions: [
        { type: 'user', user_id: 'user-2' }
      ]
    }
  }

  const returned = await createNotifications(context)

  assert.equal(returned, context)
  assert.equal(db.tables.notifications.length, 1)
  assert.equal(db.tables.notifications[0].user_id, 'user-2')
  assert.equal(db.tables.notifications[0].type, 'mention')
  assert.equal(enqueuedBatches.length, 1)
  assert.equal(enqueuedBatches[0][0].id, db.tables.notifications[0].id)
})

test('buildNotificationsToInsert creates dm_message notifications without mentions', async () => {
  const db = createDb({
    channels: [
      { id: 'channel-dm', type: 'dm' }
    ],
    channel_members: [
      { channel_id: 'channel-dm', user_id: 'user-1', notifications: 'all' },
      { channel_id: 'channel-dm', user_id: 'user-2', notifications: 'all' },
      { channel_id: 'channel-dm', user_id: 'user-3', notifications: 'none' }
    ]
  })

  const notifications = await buildNotificationsToInsert({
    app: {
      get(key) {
        if (key !== 'postgresqlClient') throw new Error(`Unexpected app.get(${key})`)
        return db
      }
    },
    params: {
      user: { id: 'user-1', display_name: 'Alice' }
    },
    result: {
      id: 'message-dm-1',
      channel_id: 'channel-dm',
      content: 'Hi there',
      mentions: []
    }
  })

  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].user_id, 'user-2')
  assert.equal(notifications[0].type, 'dm_message')
})
