import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertActiveLocalAuthenticationResult,
  assertCurrentAccessTokenVersion,
  resolveBrowserJwtOptions,
  resolveRememberJwtOptions
} from '../src/authentication.js'
import {
  clearAuthenticationRateLimitHook,
  createAuthenticationRateLimitHook
} from '../src/hooks/rate-limit.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'
import { assertAccessTokenVersion, buildAuthTokenPayload } from '../src/lib/auth-token-version.js'

test('remember-me auth requests receive the configured extended JWT options', () => {
  const options = resolveRememberJwtOptions(
    { strategy: 'local', email: 'alex@example.com', password: 'secret', remember: true },
    { rememberJwtOptions: { expiresIn: '30d' } }
  )

  assert.deepEqual(options, { expiresIn: '30d' })
})

test('browser-mode auth requests receive the short-lived browser JWT options', () => {
  const options = resolveBrowserJwtOptions(
    { strategy: 'local', email: 'alex@example.com', password: 'secret', remember: true, session_mode: 'browser' },
    { browserJwtOptions: { expiresIn: '15m' } }
  )

  assert.deepEqual(options, { expiresIn: '15m' })
})

test('non-browser auth requests keep browser JWT overrides disabled', () => {
  const options = resolveBrowserJwtOptions(
    { strategy: 'local', email: 'alex@example.com', password: 'secret', remember: true },
    { browserJwtOptions: { expiresIn: '15m' } }
  )

  assert.deepEqual(options, {})
})

test('non-remember auth requests keep the default JWT options', () => {
  const options = resolveRememberJwtOptions(
    { strategy: 'local', email: 'alex@example.com', password: 'secret', remember: false },
    { rememberJwtOptions: { expiresIn: '30d' } }
  )

  assert.deepEqual(options, {})
})

test('jwt re-authentication does not inherit remember-me login overrides', () => {
  const options = resolveRememberJwtOptions(
    { strategy: 'jwt', accessToken: 'token', remember: true },
    { rememberJwtOptions: { expiresIn: '30d' } }
  )

  assert.deepEqual(options, {})
})

test('access tokens are bound to the current user auth version', () => {
  assert.deepEqual(buildAuthTokenPayload({ auth_version: 3 }), { auth_version: 3 })
  assert.doesNotThrow(() => assertAccessTokenVersion({ auth_version: 3 }, { auth_version: 3 }))

  assert.throws(
    () => assertAccessTokenVersion({ auth_version: 2 }, { auth_version: 3 }),
    (error) => error.name === 'NotAuthenticated'
  )
})

function createAuthVersionApp(currentUser) {
  const calls = []
  const db = (table) => ({
    select(...columns) {
      calls.push({ operation: 'select', table, columns })
      return this
    },
    where(column, value) {
      calls.push({ operation: 'where', column, value })
      return this
    },
    async first() {
      return currentUser ? { ...currentUser } : undefined
    }
  })

  return {
    app: {
      get(key) {
        return key === 'postgresqlClient' ? db : null
      }
    },
    calls
  }
}

test('jwt validation uses the internal auth version when the external user is protected', async () => {
  const protectedUser = { id: 'reactivated-user', display_name: 'Reactivated User' }
  const { app, calls } = createAuthVersionApp({
    id: protectedUser.id,
    auth_version: 5
  })

  await assert.doesNotReject(
    assertCurrentAccessTokenVersion(
      app,
      { sub: protectedUser.id, auth_version: 5 },
      protectedUser
    )
  )

  assert.equal(Object.hasOwn(protectedUser, 'auth_version'), false)
  assert.deepEqual(calls, [
    { operation: 'select', table: 'users', columns: ['id', 'auth_version'] },
    { operation: 'where', column: 'id', value: protectedUser.id }
  ])
})

test('jwt validation still rejects stale tokens and missing internal users', async () => {
  const protectedUser = { id: 'reactivated-user' }
  const currentUserHarness = createAuthVersionApp({
    id: protectedUser.id,
    auth_version: 5
  })

  await assert.rejects(
    assertCurrentAccessTokenVersion(
      currentUserHarness.app,
      { sub: protectedUser.id, auth_version: 4 },
      protectedUser
    ),
    (error) => error.name === 'NotAuthenticated'
  )

  const missingUserHarness = createAuthVersionApp(null)
  await assert.rejects(
    assertCurrentAccessTokenVersion(
      missingUserHarness.app,
      { sub: protectedUser.id, auth_version: 5 },
      protectedUser
    ),
    (error) => error.name === 'NotAuthenticated' && error.message === 'User not found'
  )
})

function createRateLimitContext({
  limiter,
  strategy = 'local',
  provider = 'rest',
  email = 'alex@example.com',
  headers = { 'x-forwarded-for': '203.0.113.10' }
} = {}) {
  return {
    app: {
      get(key) {
        if (key === 'rateLimiter') return limiter
        return null
      }
    },
    params: provider ? { provider, headers } : { headers },
    data: {
      strategy,
      email
    }
  }
}

test('local external auth is rate-limited after repeated attempts', async () => {
  const now = 1_000
  const limiter = createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now })
  const hook = createAuthenticationRateLimitHook({
    env: { NODE_ENV: 'production' }
  })
  const ip = '203.0.113.10'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await hook(createRateLimitContext({
      limiter,
      email: `alex-${attempt}@example.com`,
      headers: { 'x-forwarded-for': ip }
    }))
  }

  await assert.rejects(
    hook(createRateLimitContext({
      limiter,
      email: 'alex-final@example.com',
      headers: { 'x-forwarded-for': ip }
    })),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.rate_limited')
      assert.equal(error.data?.error_params?.retry_after_seconds, 600)
      return true
    }
  )
})

test('successful local login clears the email rate-limit bucket', async () => {
  const now = 2_000
  const limiter = createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now })
  const hook = createAuthenticationRateLimitHook({
    env: { NODE_ENV: 'production' }
  })
  const context = createRateLimitContext({ limiter, email: 'Reset.Me@example.com' })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await hook(context)
  }

  await clearAuthenticationRateLimitHook(context)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await hook(context)
  }
})

test('jwt re-authentication and internal local auth bypass rate limiting', async () => {
  const now = 3_000
  const limiter = createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now })
  const hook = createAuthenticationRateLimitHook({
    env: { NODE_ENV: 'production' }
  })
  const jwtContext = createRateLimitContext({ limiter, strategy: 'jwt' })
  const internalContext = createRateLimitContext({ limiter, provider: null, strategy: 'local' })
  const localContext = createRateLimitContext({ limiter, strategy: 'local', email: 'fresh@example.com' })

  for (let attempt = 0; attempt < 25; attempt += 1) {
    await hook(jwtContext)
    await hook(internalContext)
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await hook({
      ...localContext,
      data: {
        ...localContext.data,
        email: `fresh-${attempt}@example.com`
      }
    })
  }
})

test('local authentication results for disabled or expired accounts are rejected before response', async () => {
  await assert.rejects(
    assertActiveLocalAuthenticationResult({
      data: { strategy: 'local' },
      result: {
        user: {
          id: 'disabled-member',
          account_type: 'member',
          disabled_at: '2026-06-14T10:00:00.000Z'
        }
      }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.account_disabled')
      return true
    }
  )

  await assert.rejects(
    assertActiveLocalAuthenticationResult({
      data: { strategy: 'local' },
      result: {
        user: {
          id: 'expired-guest',
          account_type: 'guest',
          disabled_at: null,
          guest_expires_at: '2000-01-01T00:00:00.000Z'
        }
      }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.account_disabled')
      return true
    }
  )

  await assert.rejects(
    assertActiveLocalAuthenticationResult({
      data: { strategy: 'local' },
      result: {
        user: {
          id: 'pending-registration',
          account_type: 'member',
          registration_status: 'pending_email_verification'
        }
      }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.account_pending')
      return true
    }
  )
})

test('non-production auth uses a higher IP rate-limit ceiling by default', async () => {
  const now = 4_000
  const limiter = createRateLimiter(new MemoryRateLimitStore({ now: () => now }), { now: () => now })
  const hook = createAuthenticationRateLimitHook({
    env: { NODE_ENV: 'development' }
  })
  const ip = '203.0.113.20'

  for (let attempt = 0; attempt < 100; attempt += 1) {
    await hook(createRateLimitContext({
      limiter,
      email: `alex-dev-${attempt}@example.com`,
      headers: { 'x-forwarded-for': ip }
    }))
  }

  await assert.rejects(
    hook(createRateLimitContext({
      limiter,
      email: 'alex-dev-final@example.com',
      headers: { 'x-forwarded-for': ip }
    })),
    (error) => {
      assert.equal(error.error_code, 'api.authentication.rate_limited')
      return true
    }
  )
})
