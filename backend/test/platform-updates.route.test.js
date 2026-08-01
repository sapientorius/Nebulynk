import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { createMemoryDb } from './helpers/memory-db.js'
import { configurePlatformUpdateRoutes } from '../src/routes/platform-updates.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'
import { encodeBytesForStorage } from '../src/lib/passkeys.js'

function usersSeed() {
  return [
    { id: 'owner-1', email: 'owner@example.com', password: 'owner-password', account_type: 'member', is_admin: true, is_primary_admin: true, disabled_at: null },
    { id: 'admin-1', email: 'admin@example.com', password: 'admin-password', account_type: 'member', is_admin: true, is_primary_admin: false, disabled_at: null },
    { id: 'member-1', email: 'member@example.com', password: 'member-password', account_type: 'member', is_admin: false, is_primary_admin: false, disabled_at: null }
  ]
}

function authService(db) {
  return {
    async verifyAccessToken(token) {
      const userId = { 'owner-token': 'owner-1', 'admin-token': 'admin-1', 'member-token': 'member-1' }[token]
      if (!userId) throw new Error('Invalid token')
      return { sub: userId }
    },
    async create(data) {
      const user = db.tables.users.find((entry) => entry.email === data.email && entry.password === data.password)
      if (!user) {
        const error = new Error('Invalid credentials')
        error.name = 'NotAuthenticated'
        error.className = 'not-authenticated'
        throw error
      }
      return { user }
    }
  }
}

async function createHarness() {
  const app = koa(feathers())
  const db = createMemoryDb({ users: usersSeed() })
  const calls = []
  const status = {
    checks_enabled: true,
    check_status: 'ok',
    comparison_status: 'update_available',
    build: { version: '0.2.0' },
    releases: []
  }
  const manager = {
    async getStatus(user) {
      return { ...status, can_manage_checks: user.is_primary_admin === true }
    },
    async check(options) {
      calls.push({ operation: 'check', options })
      return true
    },
    async acknowledge(user, versions) {
      calls.push({ operation: 'acknowledge', userId: user.id, versions })
      return this.getStatus(user)
    },
    async setChecksEnabled(user, enabled) {
      calls.push({ operation: 'settings', userId: user.id, enabled })
      status.checks_enabled = enabled
      return this.getStatus(user)
    }
  }
  app.set('postgresqlClient', db)
  app.set('platformUpdateManager', manager)
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore()))
  app.set('frontendOrigins', ['http://127.0.0.1:5173'])
  app.set('passkeyRpId', '127.0.0.1')
  app.set('passkeyHelpers', {
    async generateAuthenticationOptions() {
      return { challenge: 'update-settings-challenge', rpId: '127.0.0.1' }
    },
    async verifyAuthenticationResponse({ response, credential }) {
      if (response?.id !== credential.id) throw new Error('Credential mismatch')
      return {
        verified: true,
        authenticationInfo: {
          newCounter: 7,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true
        }
      }
    }
  })
  const authentication = authService(db)
  const originalService = app.service.bind(app)
  app.service = (name) => name === 'authentication' ? authentication : originalService(name)
  app.use(bodyParser())
  configurePlatformUpdateRoutes(app)
  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    manager,
    db,
    calls,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  }
}

async function request(harness, path, { token = 'owner-token', method = 'GET', body } = {}) {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return { response, payload: await response.json() }
}

test('update status is admin-only while checks and acknowledgements are available to every admin', async () => {
  const harness = await createHarness()
  try {
    const member = await request(harness, '/platform-updates', { token: 'member-token' })
    assert.equal(member.response.status, 403)
    assert.equal(member.payload.error_code, 'api.platform_updates.admin_required')

    const admin = await request(harness, '/platform-updates', { token: 'admin-token' })
    assert.equal(admin.response.status, 200)
    assert.equal(admin.payload.can_manage_checks, false)

    const checked = await request(harness, '/platform-updates/check', { token: 'admin-token', method: 'POST', body: {} })
    assert.equal(checked.response.status, 200)
    const acknowledged = await request(harness, '/platform-updates/acknowledgements', {
      token: 'admin-token', method: 'POST', body: { versions: ['0.3.0'] }
    })
    assert.equal(acknowledged.response.status, 200)
    assert.deepEqual(harness.calls[1], { operation: 'acknowledge', userId: 'admin-1', versions: ['0.3.0'] })
  } finally {
    await harness.close()
  }
})

test('only the owner can change update settings', async () => {
  const harness = await createHarness()
  try {
    const response = await request(harness, '/platform-updates/settings', {
      token: 'admin-token', method: 'PATCH', body: { checks_enabled: true }
    })
    assert.equal(response.response.status, 403)
    assert.equal(response.payload.error_code, 'api.platform_updates.primary_admin_required')
    assert.equal(harness.calls.length, 0)
  } finally {
    await harness.close()
  }
})

test('disabling checks requires the exact risk phrase and current password', async () => {
  const harness = await createHarness()
  try {
    const missingPhrase = await request(harness, '/platform-updates/settings', {
      method: 'PATCH', body: { checks_enabled: false, reauth: { method: 'password', current_password: 'owner-password' } }
    })
    assert.equal(missingPhrase.response.status, 400)
    assert.equal(missingPhrase.payload.error_code, 'api.platform_updates.confirmation_required')

    const wrongPassword = await request(harness, '/platform-updates/settings', {
      method: 'PATCH',
      body: { checks_enabled: false, confirmation: 'DISABLE_UPDATE_CHECKS', reauth: { method: 'password', current_password: 'wrong' } }
    })
    assert.equal(wrongPassword.response.status, 400)
    assert.equal(wrongPassword.payload.error_code, 'api.sensitive_reauth.invalid_current_password')

    const disabled = await request(harness, '/platform-updates/settings', {
      method: 'PATCH',
      body: { checks_enabled: false, confirmation: 'DISABLE_UPDATE_CHECKS', reauth: { method: 'password', current_password: 'owner-password' } }
    })
    assert.equal(disabled.response.status, 200)
    assert.equal(disabled.payload.checks_enabled, false)
    assert.deepEqual(harness.calls.at(-1), { operation: 'settings', userId: 'owner-1', enabled: false })
  } finally {
    await harness.close()
  }
})

test('reenabling checks needs no risk phrase and disabled manual checks return 409', async () => {
  const harness = await createHarness()
  try {
    const enabled = await request(harness, '/platform-updates/settings', {
      method: 'PATCH', body: { checks_enabled: true }
    })
    assert.equal(enabled.response.status, 200)

    harness.manager.check = async () => {
      throw Object.assign(new Error('platform_update_checks_disabled'), { code: 'platform_update_checks_disabled' })
    }
    const checked = await request(harness, '/platform-updates/check', { method: 'POST', body: {} })
    assert.equal(checked.response.status, 409)
    assert.equal(checked.payload.error_code, 'api.platform_updates.checks_disabled')
  } finally {
    await harness.close()
  }
})

test('owner can confirm disabling with a registered passkey', async () => {
  const harness = await createHarness()
  harness.db.tables.user_passkeys.push({
    id: 'passkey-1',
    user_id: 'owner-1',
    credential_id: 'owner-credential',
    public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3, 4])),
    counter: 1,
    device_type: 'singleDevice',
    backed_up: false,
    transports: JSON.stringify(['internal']),
    name: 'Owner passkey',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z'
  })
  try {
    const options = await request(harness, '/platform-updates/settings/passkey-options', { method: 'POST', body: {} })
    assert.equal(options.response.status, 200)
    assert.equal(options.payload.options.challenge, 'update-settings-challenge')

    const disabled = await request(harness, '/platform-updates/settings', {
      method: 'PATCH',
      body: {
        checks_enabled: false,
        confirmation: 'DISABLE_UPDATE_CHECKS',
        reauth: {
          method: 'passkey',
          challenge_id: options.payload.challengeId,
          authentication_response: { id: 'owner-credential' }
        }
      }
    })
    assert.equal(disabled.response.status, 200)
    assert.equal(harness.db.tables.user_passkeys[0].counter, 7)
    assert.ok(harness.db.tables.auth_passkey_challenges[0].used_at)
  } finally {
    await harness.close()
  }
})

test('owner settings changes are rate-limited independently on the server', async () => {
  const harness = await createHarness()
  try {
    let last
    for (let index = 0; index < 11; index += 1) {
      last = await request(harness, '/platform-updates/settings', {
        method: 'PATCH', body: { checks_enabled: true }
      })
    }
    assert.equal(last.response.status, 429)
    assert.equal(last.payload.error_code, 'api.platform_updates.rate_limited')
  } finally {
    await harness.close()
  }
})
