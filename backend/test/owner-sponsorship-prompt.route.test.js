import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { createMemoryDb } from './helpers/memory-db.js'
import { configureOwnerSponsorshipPromptRoutes } from '../src/routes/owner-sponsorship-prompt.js'

function createSeed() {
  return {
    users: [
      {
        id: 'primary-1',
        email: 'primary@example.com',
        account_type: 'member',
        is_primary_admin: true,
        disabled_at: null
      },
      {
        id: 'manager-1',
        email: 'manager@example.com',
        account_type: 'member',
        is_primary_admin: false,
        disabled_at: null
      }
    ]
  }
}

function createAuthService() {
  return {
    async verifyAccessToken(token) {
      const userId = {
        'primary-token': 'primary-1',
        'manager-token': 'manager-1'
      }[token]
      if (!userId) throw new Error('Invalid token')
      return { sub: userId }
    }
  }
}

async function createRouteHarness() {
  let currentTime = new Date('2026-07-01T12:00:00.000Z')
  const app = koa(feathers())
  const db = createMemoryDb(createSeed())
  app.set('postgresqlClient', db)

  const authService = createAuthService()
  const originalService = app.service.bind(app)
  app.service = (name) => (name === 'authentication' ? authService : originalService(name))

  app.use(bodyParser())
  configureOwnerSponsorshipPromptRoutes(app, { now: () => new Date(currentTime) })

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    db,
    baseUrl: `http://127.0.0.1:${address.port}`,
    advanceBy(milliseconds) {
      currentTime = new Date(currentTime.getTime() + milliseconds)
    },
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

async function request(harness, path, { method = 'GET', token = 'primary-token', body } = {}) {
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

test('sponsorship prompt API is restricted to the primary admin', async () => {
  const harness = await createRouteHarness()
  try {
    const { response, payload } = await request(harness, '/platform-owner/sponsorship-prompt', {
      token: 'manager-token'
    })

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.sponsorship.primary_admin_required')
  } finally {
    await harness.close()
  }
})

test('sponsorship prompt claims show once per seven-day interval', async () => {
  const harness = await createRouteHarness()
  try {
    const preference = await request(harness, '/platform-owner/sponsorship-prompt')
    assert.equal(preference.response.status, 200)
    assert.deepEqual(preference.payload, { enabled: true })

    const firstClaim = await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    const secondClaim = await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    assert.deepEqual(firstClaim.payload, { show: true })
    assert.deepEqual(secondClaim.payload, { show: false })

    harness.advanceBy(7 * 24 * 60 * 60 * 1000)
    const claimAfterOneWeek = await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    assert.deepEqual(claimAfterOneWeek.payload, { show: true })
  } finally {
    await harness.close()
  }
})

test('concurrent sponsorship claims reserve the prompt only once', async () => {
  const harness = await createRouteHarness()
  try {
    const claims = await Promise.all([
      request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} }),
      request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    ])

    assert.equal(claims.filter(({ payload }) => payload.show === true).length, 1)
    assert.equal(harness.db.tables.user_sponsorship_prompt_preferences.length, 1)
  } finally {
    await harness.close()
  }
})

test('disabled sponsorship prompts do not claim and can be re-enabled without resetting the interval', async () => {
  const harness = await createRouteHarness()
  try {
    await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })

    const disabled = await request(harness, '/platform-owner/sponsorship-prompt', {
      method: 'PATCH',
      body: { enabled: false }
    })
    assert.deepEqual(disabled.payload, { enabled: false })

    const disabledClaim = await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    assert.deepEqual(disabledClaim.payload, { show: false })

    const enabled = await request(harness, '/platform-owner/sponsorship-prompt', {
      method: 'PATCH',
      body: { enabled: true }
    })
    assert.deepEqual(enabled.payload, { enabled: true })

    const immediateClaim = await request(harness, '/platform-owner/sponsorship-prompt/claim', { method: 'POST', body: {} })
    assert.deepEqual(immediateClaim.payload, { show: false })
  } finally {
    await harness.close()
  }
})

test('sponsorship prompt migration stores private user-bound preferences', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../migrations/061_owner_sponsorship_prompt_preferences.js', import.meta.url), 'utf8'))

  assert.match(source, /user_sponsorship_prompt_preferences/)
  assert.match(source, /user_id/)
  assert.match(source, /last_shown_at/)
  assert.match(source, /disabled_at/)
})
