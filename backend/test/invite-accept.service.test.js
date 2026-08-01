import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { inviteAccept } from '../src/services/invite-accept/invite-accept.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

function createAppWithRateLimiter(now = 1_000) {
  const app = feathers()
  app.set('postgresqlClient', {})
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now }))
  app.use('users', {
    async create() {
      return { id: 'user-1' }
    }
  })
  inviteAccept(app)

  const service = app.service('invite-accept')
  service.domainService = {
    async findInviteByToken(token) {
      return {
        token,
        platform_name: 'Nebulynk',
        is_expired: false
      }
    },
    async acceptInvite() {
      return {
        success: true,
        user: { id: 'user-1' }
      }
    }
  }

  return service
}

test('invite-accept.find is rate-limited for repeated public token lookups', async () => {
  const service = createAppWithRateLimiter()
  const params = {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.20' },
    query: { token: 'invite-token-1' }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await service.find(params)
  }

  await assert.rejects(
    service.find(params),
    (error) => {
      assert.equal(error.error_code, 'api.invite_accept.rate_limited')
      assert.equal(error.data?.error_params?.retry_after_seconds, 600)
      return true
    }
  )
})

test('invite-accept.create is rate-limited for repeated public accept attempts', async () => {
  const service = createAppWithRateLimiter()
  const params = {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.21' }
  }
  const data = {
    token: 'invite-token-2',
    display_name: 'Invite User',
    password: 'strong-password'
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await service.create(data, params)
  }

  await assert.rejects(
    service.create(data, params),
    (error) => {
      assert.equal(error.error_code, 'api.invite_accept.rate_limited')
      assert.equal(error.data?.error_params?.retry_after_seconds, 600)
      return true
    }
  )
})
