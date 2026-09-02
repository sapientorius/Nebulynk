import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { createMemoryDb } from './helpers/memory-db.js'
import { configureSystemInfoRoutes } from '../src/routes/system-info.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

function usersSeed() {
  return [
    { id: 'admin-1', email: 'admin@example.com', password: 'admin-password', account_type: 'member', is_admin: true, disabled_at: null },
    { id: 'member-1', email: 'member@example.com', password: 'member-password', account_type: 'member', is_admin: false, disabled_at: null }
  ]
}

function authService(db) {
  return {
    async verifyAccessToken(token) {
      const userId = { 'admin-token': 'admin-1', 'member-token': 'member-1' }[token]
      if (!userId) throw new Error('Invalid token')
      return { sub: userId }
    }
  }
}

async function createHarness() {
  const app = koa(feathers())
  const db = createMemoryDb({ users: usersSeed() })
  const calls = []
  const manager = {
    async getUsage() {
      calls.push('get')
      return { state: 'fresh', total_bytes: '42' }
    },
    async refresh() {
      calls.push('refresh')
      return { state: 'fresh', total_bytes: '43' }
    }
  }
  app.set('postgresqlClient', db)
  app.set('storageUsageManager', manager)
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore()))
  const authentication = authService(db)
  const originalService = app.service.bind(app)
  app.service = (name) => name === 'authentication' ? authentication : originalService(name)
  app.use(bodyParser())
  configureSystemInfoRoutes(app)
  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    calls,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  }
}

async function request(harness, path, { token = 'admin-token', method = 'GET' } = {}) {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(method === 'POST' ? { body: '{}' } : {})
  })
  return { response, payload: await response.json() }
}

test('system info storage usage is limited to platform administrators', async () => {
  const harness = await createHarness()
  try {
    const member = await request(harness, '/system-info/storage-usage', { token: 'member-token' })
    assert.equal(member.response.status, 403)
    assert.equal(member.payload.error_code, 'api.system_info.admin_required')

    const memberRefresh = await request(harness, '/system-info/storage-usage/refresh', { token: 'member-token', method: 'POST' })
    assert.equal(memberRefresh.response.status, 403)
    assert.equal(memberRefresh.payload.error_code, 'api.system_info.admin_required')

    const admin = await request(harness, '/system-info/storage-usage')
    assert.equal(admin.response.status, 200)
    assert.equal(admin.payload.total_bytes, '42')

    const refreshed = await request(harness, '/system-info/storage-usage/refresh', { method: 'POST' })
    assert.equal(refreshed.response.status, 200)
    assert.equal(refreshed.payload.total_bytes, '43')
    assert.deepEqual(harness.calls, ['get', 'refresh'])
  } finally {
    await harness.close()
  }
})

test('system info manual refreshes are rate-limited server-side', async () => {
  const harness = await createHarness()
  try {
    let last
    for (let index = 0; index < 11; index += 1) {
      last = await request(harness, '/system-info/storage-usage/refresh', { method: 'POST' })
    }
    assert.equal(last.response.status, 429)
    assert.equal(last.payload.error_code, 'api.system_info.rate_limited')
  } finally {
    await harness.close()
  }
})
