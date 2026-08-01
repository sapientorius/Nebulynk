import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import { pushSubscriptions } from '../src/services/push-subscriptions/push-subscriptions.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createHarness(seed = {}) {
  const db = createMemoryDb(seed)
  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', db)
  pushSubscriptions(app)
  return { app, db }
}

function userParams(userId) {
  return {
    provider: 'rest',
    authenticated: true,
    user: { id: userId }
  }
}

function subscription(overrides = {}) {
  return {
    id: overrides.id || 'sub-1',
    user_id: overrides.user_id || 'user-1',
    endpoint: overrides.endpoint || 'https://push.example.test/sub-1',
    p256dh: overrides.p256dh || 'p256dh-key',
    auth: overrides.auth || 'auth-secret'
  }
}

test('push-subscriptions service: find is scoped to the current user', async () => {
  const { app } = createHarness({
    push_subscriptions: [
      subscription({ id: 'sub-user-1', user_id: 'user-1' }),
      subscription({ id: 'sub-user-2', user_id: 'user-2' })
    ]
  })

  const result = await app.service('push-subscriptions').find({
    ...userParams('user-1'),
    query: { user_id: 'user-2' }
  })

  assert.deepEqual(result.map((item) => item.id), ['sub-user-1'])
})

test('push-subscriptions service: create assigns ownership to the current user', async () => {
  const { app, db } = createHarness()

  const result = await app.service('push-subscriptions').create({
    endpoint: 'https://push.example.test/sub-new',
    p256dh: 'new-p256dh',
    auth: 'new-auth'
  }, userParams('user-2'))

  assert.equal(result.user_id, 'user-2')
  assert.equal(typeof result.id, 'string')
  assert.equal(db.tables.push_subscriptions.length, 1)
  assert.equal(db.tables.push_subscriptions[0].user_id, 'user-2')
})

test('push-subscriptions service: same endpoint takeover removes the stale owner subscription', async () => {
  const endpoint = 'https://push.example.test/shared-browser-endpoint'
  const { app, db } = createHarness({
    push_subscriptions: [
      subscription({ id: 'sub-old-owner', user_id: 'user-1', endpoint })
    ]
  })

  await app.service('push-subscriptions').create({
    endpoint,
    p256dh: 'new-owner-p256dh',
    auth: 'new-owner-auth'
  }, userParams('user-2'))

  assert.equal(db.tables.push_subscriptions.length, 1)
  assert.equal(db.tables.push_subscriptions[0].user_id, 'user-2')
  assert.equal(db.tables.push_subscriptions[0].endpoint, endpoint)
})

test('push-subscriptions service: removing another user subscription is forbidden', async () => {
  const { app, db } = createHarness({
    push_subscriptions: [
      subscription({ id: 'sub-user-1', user_id: 'user-1' })
    ]
  })

  await assert.rejects(
    app.service('push-subscriptions').remove('sub-user-1', userParams('user-2')),
    Forbidden
  )

  assert.equal(db.tables.push_subscriptions.length, 1)
})

test('push-subscriptions service: removing an owned subscription returns and deletes it', async () => {
  const { app, db } = createHarness({
    push_subscriptions: [
      subscription({ id: 'sub-user-1', user_id: 'user-1' })
    ]
  })

  const removed = await app.service('push-subscriptions').remove('sub-user-1', userParams('user-1'))

  assert.equal(removed.id, 'sub-user-1')
  assert.equal(db.tables.push_subscriptions.length, 0)
})
