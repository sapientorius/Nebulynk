import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden, NotFound } from '@feathersjs/errors'
import { MessageRemindersService } from '../src/services/message-reminders/message-reminders.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createService(db) {
  return new MessageRemindersService({
    Model: db,
    name: 'message_reminders',
    generateId: () => `reminder-${db.tables.message_reminders.length + 1}`
  })
}

function seedDb(overrides = {}) {
  return createMemoryDb({
    users: [
      { id: 'user-1', is_admin: false },
      { id: 'user-2', is_admin: false }
    ],
    channels: [
      { id: 'channel-1' },
      { id: 'channel-2' }
    ],
    channel_members: [
      { channel_id: 'channel-1', user_id: 'user-1' },
      { channel_id: 'channel-2', user_id: 'user-2' }
    ],
    messages: [
      { id: 'message-1', channel_id: 'channel-1', content: 'Remember me', deleted_at: null },
      { id: 'message-2', channel_id: 'channel-2', content: 'Hidden', deleted_at: null },
      { id: 'message-deleted', channel_id: 'channel-1', content: 'Gone', deleted_at: '2026-06-19T10:00:00.000Z' }
    ],
    ...overrides
  })
}

test('message-reminders create requires readable message access', async () => {
  const db = seedDb()
  const service = createService(db)

  await assert.rejects(
    service.create({
      message_id: 'message-2',
      remind_at: '2999-01-01T10:00:00.000Z'
    }, {
      user: { id: 'user-1', is_admin: false }
    }),
    Forbidden
  )

  await assert.rejects(
    service.create({
      message_id: 'message-deleted',
      remind_at: '2999-01-01T10:00:00.000Z'
    }, {
      user: { id: 'user-1', is_admin: false }
    }),
    NotFound
  )
})

test('message-reminders create replaces existing active reminder for same user and message', async () => {
  const db = seedDb()
  const service = createService(db)
  const params = { user: { id: 'user-1', is_admin: false } }

  const first = await service.create({
    message_id: 'message-1',
    remind_at: '2999-01-01T10:00:00.000Z'
  }, params)
  const second = await service.create({
    message_id: 'message-1',
    remind_at: '2999-01-01T14:00:00.000Z'
  }, params)

  assert.equal(first.id, second.id)
  assert.equal(second.remind_at, '2999-01-01T14:00:00.000Z')
  assert.equal(db.tables.message_reminders.length, 1)
})

test('message-reminders find, patch, and remove stay scoped to owner', async () => {
  const db = seedDb({
    message_reminders: [{
      id: 'reminder-owner',
      user_id: 'user-1',
      message_id: 'message-1',
      channel_id: 'channel-1',
      remind_at: '2999-01-01T10:00:00.000Z',
      status: 'active'
    }]
  })
  const service = createService(db)

  const ownRows = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: { message_id: 'message-1', status: 'active' }
  })
  assert.equal(ownRows.length, 1)

  await assert.rejects(
    service.patch('reminder-owner', { remind_at: '2999-01-02T10:00:00.000Z' }, {
      user: { id: 'user-2', is_admin: false }
    }),
    NotFound
  )

  const cancelled = await service.remove('reminder-owner', {
    user: { id: 'user-1', is_admin: false }
  })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(db.tables.message_reminders[0].status, 'cancelled')
})
