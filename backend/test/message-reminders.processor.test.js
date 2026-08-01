import test from 'node:test'
import assert from 'node:assert/strict'
import { processDueMessageReminders } from '../src/services/message-reminders/processor.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp(db, enqueued) {
  return {
    get(key) {
      if (key === 'postgresqlClient') return db
      if (key === 'notificationSideEffectsDispatcher') {
        return {
          enqueue(batch) {
            enqueued.push(batch.map((entry) => ({ ...entry })))
          }
        }
      }
      throw new Error(`Unexpected app.get(${key})`)
    }
  }
}

test('message reminder processor delivers due reminders exactly once', async () => {
  const db = createMemoryDb({
    users: [{ id: 'user-1', is_admin: false, preferred_locale: 'de' }],
    channels: [{ id: 'channel-1' }],
    channel_members: [{ channel_id: 'channel-1', user_id: 'user-1' }],
    messages: [{ id: 'message-1', channel_id: 'channel-1', content: 'Bitte spaeter ansehen', deleted_at: null }],
    message_reminders: [{
      id: 'reminder-1',
      user_id: 'user-1',
      message_id: 'message-1',
      channel_id: 'channel-1',
      remind_at: '2026-06-19T10:00:00.000Z',
      status: 'active'
    }]
  })
  const enqueued = []
  const app = createApp(db, enqueued)

  const first = await processDueMessageReminders(app, {
    now: new Date('2026-06-19T10:01:00.000Z'),
    generateId: () => 'notification-1'
  })
  const second = await processDueMessageReminders(app, {
    now: new Date('2026-06-19T10:02:00.000Z'),
    generateId: () => 'notification-2'
  })

  assert.equal(first.delivered, 1)
  assert.equal(second.delivered, 0)
  assert.equal(db.tables.notifications.length, 1)
  assert.equal(db.tables.notifications[0].type, 'message_reminder')
  assert.equal(db.tables.notifications[0].message_id, 'message-1')
  assert.equal(db.tables.notifications[0].actor_display_name, 'Erinnerung')
  assert.equal(db.tables.message_reminders[0].status, 'delivered')
  assert.equal(enqueued.length, 1)
  assert.equal(enqueued[0][0].id, 'notification-1')
})

test('message reminder processor cancels due reminders when message is inaccessible', async () => {
  const db = createMemoryDb({
    users: [{ id: 'user-1', is_admin: false, preferred_locale: 'en' }],
    channels: [{ id: 'channel-1' }],
    channel_members: [],
    messages: [{ id: 'message-1', channel_id: 'channel-1', content: 'Hidden now', deleted_at: null }],
    message_reminders: [{
      id: 'reminder-1',
      user_id: 'user-1',
      message_id: 'message-1',
      channel_id: 'channel-1',
      remind_at: '2026-06-19T10:00:00.000Z',
      status: 'active'
    }]
  })
  const enqueued = []

  const result = await processDueMessageReminders(createApp(db, enqueued), {
    now: new Date('2026-06-19T10:01:00.000Z')
  })

  assert.equal(result.skipped, 1)
  assert.equal(db.tables.notifications.length, 0)
  assert.equal(db.tables.message_reminders[0].status, 'cancelled')
  assert.deepEqual(enqueued, [])
})
