import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest } from '@feathersjs/errors'
import { NotificationsService } from '../src/services/notifications/notifications.js'

function createQueryBuilder(rows = [], count = rows.length) {
  return {
    _rows: rows,
    _count: count,
    where() { return this },
    whereIn() { return this },
    orderBy() { return this },
    limit() { return this },
    count() { return this },
    first() { return Promise.resolve({ count: String(this._count) }) },
    update() { return Promise.resolve(this._count) },
    then(resolve, reject) {
      return Promise.resolve(this._rows).then(resolve, reject)
    }
  }
}

function createService(db) {
  return new NotificationsService({
    Model: db,
    name: 'notifications'
  })
}

test('notifications.find returns unread_total independent of result limit', async () => {
  const rows = [
    { id: 'notification-3', is_read: false },
    { id: 'notification-2', is_read: true },
    { id: 'notification-1', is_read: false }
  ]

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return createQueryBuilder(rows, 7)
  }

  const service = createService(db)
  const result = await service.find({
    user: { id: 'user-1' },
    query: { $limit: 3 }
  })

  assert.equal(result.data.length, 3)
  assert.equal(result.limit, 3)
  assert.equal(result.unread_total, 7)
})

test('notifications.patch bulk scope updates only matching message notifications', async () => {
  const whereCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(2)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      message_id: 'message-1'
    }
  })

  assert.equal(result.updated, 2)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false],
    ['message_id', 'message-1']
  ])
})

test('notifications.patch bulk scope updates only matching batched message notifications', async () => {
  const whereCalls = []
  const whereInCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    whereIn(...args) {
      whereInCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(3)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      message_ids: ['message-1', 'message-2', 'message-2']
    }
  })

  assert.equal(result.updated, 3)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false]
  ])
  assert.deepEqual(whereInCalls, [
    ['message_id', ['message-1', 'message-2']]
  ])
})

test('notifications.patch bulk scope accepts axios-style bracketed batch query keys', async () => {
  const whereCalls = []
  const whereInCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    whereIn(...args) {
      whereInCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(2)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      'message_ids[]': ['message-1', 'message-2']
    }
  })

  assert.equal(result.updated, 2)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false]
  ])
  assert.deepEqual(whereInCalls, [
    ['message_id', ['message-1', 'message-2']]
  ])
})

test('notifications.patch bulk scope accepts indexed batch query objects from query parser', async () => {
  const whereCalls = []
  const whereInCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    whereIn(...args) {
      whereInCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(2)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      message_ids: {
        0: 'message-1',
        1: 'message-2'
      }
    }
  })

  assert.equal(result.updated, 2)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false]
  ])
  assert.deepEqual(whereInCalls, [
    ['message_id', ['message-1', 'message-2']]
  ])
})

test('notifications.patch bulk scope updates only matching meeting invite notifications', async () => {
  const whereCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(1)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      meeting_id: 'meeting-1',
      type: 'meeting_invite'
    }
  })

  assert.equal(result.updated, 1)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false],
    ['meeting_id', 'meeting-1'],
    ['type', 'meeting_invite']
  ])
})

test('notifications.patch bulk scope returns updated 0 when no rows match', async () => {
  const builder = {
    where() { return builder },
    update() {
      return Promise.resolve(0)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      message_id: 'missing-message'
    }
  })

  assert.equal(result.updated, 0)
})

test('notifications.patch bulk scope validates scoped query filters', async () => {
  const db = () => ({
    where() { return this },
    update() { return Promise.resolve(0) }
  })

  const service = createService(db)

  await assert.rejects(
    service.patch(null, { is_read: true }, {
      user: { id: 'user-1' },
      query: {
        type: 'invalid-type'
      }
    }),
    BadRequest
  )

  await assert.rejects(
    service.patch(null, { is_read: true }, {
      user: { id: 'user-1' },
      query: {
        message_ids: ['message-1', '']
      }
    }),
    BadRequest
  )

  await assert.rejects(
    service.patch(null, { is_read: true }, {
      user: { id: 'user-1' },
      query: {
        message_id: 'message-1',
        message_ids: ['message-2']
      }
    }),
    BadRequest
  )
})

test('notifications.patch bulk scope accepts message reminder notification type', async () => {
  const whereCalls = []
  const builder = {
    where(...args) {
      whereCalls.push(args)
      return builder
    },
    update() {
      return Promise.resolve(1)
    }
  }

  const db = (table) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table: ${table}`)
    }
    return builder
  }

  const service = createService(db)
  const result = await service.patch(null, { is_read: true }, {
    user: { id: 'user-1' },
    query: {
      is_read: false,
      message_id: 'message-1',
      type: 'message_reminder'
    }
  })

  assert.equal(result.updated, 1)
  assert.deepEqual(whereCalls, [
    ['user_id', 'user-1'],
    ['is_read', false],
    ['message_id', 'message-1'],
    ['type', 'message_reminder']
  ])
})
