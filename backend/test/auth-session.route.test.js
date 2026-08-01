import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { configureAuthSessionRoutes } from '../src/routes/auth-session.js'
import { logger } from '../src/logger.js'

function createQueryBuilder(rows, options = {}) {
  const filters = []

  const builder = {
    where(column, value) {
      filters.push((row) => row[column] === value)
      return this
    },
    whereNull(column) {
      filters.push((row) => row[column] == null)
      return this
    },
    async first() {
      return this._resolve()[0] ? { ...this._resolve()[0] } : undefined
    },
    async insert(payload) {
      if (options.failInsert === true) {
        throw new Error('insert failed unexpectedly')
      }
      rows.push({ ...payload })
      return 1
    },
    async update(payload) {
      const matches = this._resolve()
      for (const match of matches) {
        Object.assign(match, payload)
      }
      return matches.length
    },
    _resolve() {
      return rows.filter((row) => filters.every((filter) => filter(row)))
    }
  }

  return builder
}

function createDb(options = {}) {
  const state = {
    users: [{
      id: 'user-1',
      email: 'alex@example.com',
      display_name: 'Alex Example',
      account_type: 'member',
      is_admin: false,
      password: 'hashed-password',
      avatar_storage_key: 'avatars/user-1/private.webp',
      meeting_video_preferences: {
        background_mode: 'blur',
        preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: false
      },
      disabled_at: null
    }],
    auth_sessions: []
  }

  const db = (table) => {
    if (!Object.prototype.hasOwnProperty.call(state, table)) {
      throw new Error(`Unexpected table: ${table}`)
    }
    return createQueryBuilder(state[table], table === 'auth_sessions' ? options.authSessions || {} : {})
  }

  db._state = state
  return db
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie()
  }

  const raw = response.headers.get('set-cookie')
  return raw ? [raw] : []
}

function extractCookie(setCookieHeaders, cookieName) {
  const target = setCookieHeaders.find((header) => header.startsWith(`${cookieName}=`))
  if (!target) return null
  return target.split(';')[0]
}

function extractCookieValue(setCookieHeaders, cookieName) {
  const cookie = extractCookie(setCookieHeaders, cookieName)
  if (!cookie) return null
  return cookie.slice(cookieName.length + 1)
}

async function createHarness({ nodeEnv = 'development', dbOptions = {} } = {}) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousTrustProxy = process.env.TRUST_PROXY
  process.env.NODE_ENV = nodeEnv
  process.env.TRUST_PROXY = 'true'
  delete process.env.AUTH_REFRESH_COOKIE_NAME
  delete process.env.AUTH_CSRF_COOKIE_NAME
  delete process.env.AUTH_COOKIE_DOMAIN
  delete process.env.AUTH_REFRESH_TOKEN_TTL
  delete process.env.AUTH_REMEMBER_REFRESH_TOKEN_TTL
  delete process.env.AUTH_BROWSER_ACCESS_TOKEN_TTL

  const app = koa(feathers())
  app.proxy = true
  const db = createDb(dbOptions)

  app.set('postgresqlClient', db)
  app.set('authentication', {
    browserJwtOptions: { expiresIn: '15m' }
  })
  const services = {
    authentication: {
      async verifyAccessToken(token) {
        if (token === 'valid-access-token' || token === 'browser-access-token') {
          return { sub: 'user-1' }
        }
        throw new Error('Invalid token')
      },
      async createAccessToken(_payload, options = {}) {
        const ttl = options.expiresIn || 'default'
        return ttl === '15m'
          ? 'browser-refreshed-access-token'
          : 'default-refreshed-access-token'
      }
    }
  }
  const originalService = app.service.bind(app)
  app.service = (name) => services[name] || originalService(name)

  app.use(bodyParser())
  configureAuthSessionRoutes(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    db,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      process.env.NODE_ENV = previousNodeEnv
      if (typeof previousTrustProxy === 'string') {
        process.env.TRUST_PROXY = previousTrustProxy
      } else {
        delete process.env.TRUST_PROXY
      }
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

test('auth session bootstrap with cookie transport sets refresh and csrf cookies', async () => {
  const harness = await createHarness({ nodeEnv: 'production' })
  const originalLoggerInfo = logger.info
  const loggerCalls = []
  logger.info = (message, meta) => {
    loggerCalls.push({ message, meta })
  }

  try {
    const response = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: true
      })
    })
    const payload = await response.json()
    const setCookieHeaders = getSetCookieHeaders(response)
    const normalizedSetCookieHeaders = setCookieHeaders.map((header) => header.toLowerCase())

    assert.equal(response.status, 200)
    assert.equal(payload.user.id, 'user-1')
    assert.deepEqual(payload.user.meeting_video_preferences, {
      background_mode: 'blur',
      preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: false
    })
    assert.equal(typeof payload.csrfToken, 'string')
    assert.equal(payload.session.transport, 'cookie')
    assert.equal(payload.session.is_persistent, true)
    assert.equal(harness.db._state.auth_sessions.length, 1)
    assert.ok(normalizedSetCookieHeaders.some((header) => header.includes('nebulynk_refresh_session=')))
    assert.ok(normalizedSetCookieHeaders.some((header) => header.includes('httponly')))
    assert.ok(normalizedSetCookieHeaders.some((header) => header.includes('samesite=none')))
    assert.ok(normalizedSetCookieHeaders.some((header) => header.includes('secure')))
    assert.ok(normalizedSetCookieHeaders.some((header) => header.includes('nebulynk_csrf_token=')))
    assert.equal(loggerCalls.length, 1)
    assert.equal(loggerCalls[0].message, 'Auth session bootstrap succeeded')
    assert.equal(loggerCalls[0].meta.transport, 'cookie')
    assert.equal(loggerCalls[0].meta.remember, true)
    assert.equal(loggerCalls[0].meta.userId, 'user-1')
    assert.equal(loggerCalls[0].meta.sessionId, payload.session.id)
    assert.equal(loggerCalls[0].meta.refreshCookieName, 'nebulynk_refresh_session')
    assert.equal(loggerCalls[0].meta.csrfCookieName, 'nebulynk_csrf_token')
    assert.equal(loggerCalls[0].meta.refreshCookie.sameSite, 'none')
    assert.equal(loggerCalls[0].meta.refreshCookie.secure, true)
    assert.equal(loggerCalls[0].meta.refreshCookie.httpOnly, true)
    assert.equal(loggerCalls[0].meta.csrfCookie.httpOnly, false)
  } finally {
    logger.info = originalLoggerInfo
    await harness.close()
  }
})

test('auth session bootstrap with body transport returns a refresh token without cookies', async () => {
  const harness = await createHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'body',
        remember: false
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(typeof payload.refreshToken, 'string')
    assert.equal(payload.session.transport, 'body')
    assert.equal(payload.session.is_persistent, false)
    assert.equal(getSetCookieHeaders(response).length, 0)
  } finally {
    await harness.close()
  }
})

test('auth session refresh rotates a cookie session and returns a short-lived browser token', async () => {
  const harness = await createHarness()
  const originalLoggerInfo = logger.info
  const loggerCalls = []
  logger.info = (message, meta) => {
    loggerCalls.push({ message, meta })
  }

  try {
    const bootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer browser-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: false
      })
    })

    const bootstrapCookies = getSetCookieHeaders(bootstrapResponse)
    const csrfToken = extractCookieValue(bootstrapCookies, 'nebulynk_csrf_token')
    const cookieHeader = [
      extractCookie(bootstrapCookies, 'nebulynk_refresh_session'),
      extractCookie(bootstrapCookies, 'nebulynk_csrf_token')
    ].filter(Boolean).join('; ')
    const originalHash = harness.db._state.auth_sessions[0].refresh_token_hash

    const refreshResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': csrfToken,
        'X-Auth-Session-Debug-Id': 'auth-debug-cookie-refresh'
      },
      body: JSON.stringify({})
    })
    const payload = await refreshResponse.json()

    assert.equal(refreshResponse.status, 200)
    assert.equal(payload.accessToken, 'browser-refreshed-access-token')
    assert.equal(typeof payload.csrfToken, 'string')
    assert.equal(payload.user.id, 'user-1')
    assert.deepEqual(payload.user.meeting_video_preferences, {
      background_mode: 'blur',
      preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: false
    })
    assert.notEqual(harness.db._state.auth_sessions[0].refresh_token_hash, originalHash)
    assert.ok(getSetCookieHeaders(refreshResponse).some((header) => header.includes('nebulynk_refresh_session=')))
    const refreshLog = loggerCalls.find((call) => call.message === 'Auth session refresh succeeded')
    assert.ok(refreshLog)
    assert.equal(refreshLog.meta.transport, 'cookie')
    assert.equal(refreshLog.meta.userId, 'user-1')
    assert.equal(refreshLog.meta.sessionId, payload.session.id)
    assert.equal(refreshLog.meta.authSessionDebugId, 'auth-debug-cookie-refresh')
    assert.equal(refreshLog.meta.refreshCookiePresent, true)
    assert.equal(refreshLog.meta.csrfCookiePresent, true)
    assert.equal(refreshLog.meta.csrfHeaderPresent, true)
    assert.equal(refreshLog.meta.refreshCookieName, 'nebulynk_refresh_session')
  } finally {
    logger.info = originalLoggerInfo
    await harness.close()
  }
})

test('auth session refresh rotates a body session and returns a replacement refresh token', async () => {
  const harness = await createHarness()

  try {
    const bootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer browser-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'body',
        remember: true
      })
    })
    const bootstrapPayload = await bootstrapResponse.json()
    const originalHash = harness.db._state.auth_sessions[0].refresh_token_hash

    const refreshResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: bootstrapPayload.refreshToken
      })
    })
    const payload = await refreshResponse.json()

    assert.equal(refreshResponse.status, 200)
    assert.equal(payload.accessToken, 'default-refreshed-access-token')
    assert.equal(typeof payload.refreshToken, 'string')
    assert.equal(payload.user.id, 'user-1')
    assert.notEqual(harness.db._state.auth_sessions[0].refresh_token_hash, originalHash)
    assert.equal(getSetCookieHeaders(refreshResponse).length, 0)
  } finally {
    await harness.close()
  }
})

test('auth session refresh recovers when duplicate refresh cookies include a stale first value', async () => {
  const harness = await createHarness()

  try {
    const staleBootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer browser-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: true
      })
    })
    const staleBootstrapCookies = getSetCookieHeaders(staleBootstrapResponse)
    const staleRefreshCookie = extractCookie(staleBootstrapCookies, 'nebulynk_refresh_session')
    const staleCsrfToken = extractCookieValue(staleBootstrapCookies, 'nebulynk_csrf_token')
    const staleCookieHeader = [
      staleRefreshCookie,
      extractCookie(staleBootstrapCookies, 'nebulynk_csrf_token')
    ].filter(Boolean).join('; ')

    const rotateResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: staleCookieHeader,
        'X-CSRF-Token': staleCsrfToken
      },
      body: JSON.stringify({})
    })
    assert.equal(rotateResponse.status, 200)

    const freshBootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer browser-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: true
      })
    })
    const freshBootstrapCookies = getSetCookieHeaders(freshBootstrapResponse)
    const freshCsrfCookie = extractCookie(freshBootstrapCookies, 'nebulynk_csrf_token')
    const freshCsrfToken = extractCookieValue(freshBootstrapCookies, 'nebulynk_csrf_token')
    const duplicateCookieHeader = [
      staleRefreshCookie,
      extractCookie(freshBootstrapCookies, 'nebulynk_refresh_session'),
      freshCsrfCookie
    ].filter(Boolean).join('; ')

    const recoveredResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: duplicateCookieHeader,
        'X-CSRF-Token': freshCsrfToken,
        'X-Auth-Session-Debug-Id': 'auth-debug-duplicate-cookie'
      },
      body: JSON.stringify({})
    })
    const payload = await recoveredResponse.json()

    assert.equal(recoveredResponse.status, 200)
    assert.equal(payload.accessToken, 'browser-refreshed-access-token')
    assert.equal(payload.user.id, 'user-1')
  } finally {
    await harness.close()
  }
})

test('auth session refresh logs missing tokens, invalid tokens, and csrf failures', async () => {
  const harness = await createHarness()
  const originalLoggerWarn = logger.warn
  const loggerCalls = []
  logger.warn = (message, meta) => {
    loggerCalls.push({ message, meta })
  }

  try {
    const missingResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Session-Debug-Id': 'auth-debug-missing'
      },
      body: JSON.stringify({})
    })
    const missingPayload = await missingResponse.json()

    assert.equal(missingResponse.status, 401)
    assert.equal(missingPayload.error_code, 'api.auth_session.invalid_refresh_token')

    const invalidResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Session-Debug-Id': 'auth-debug-invalid'
      },
      body: JSON.stringify({
        refreshToken: 'bad-token'
      })
    })
    const invalidPayload = await invalidResponse.json()

    assert.equal(invalidResponse.status, 401)
    assert.equal(invalidPayload.error_code, 'api.auth_session.invalid_refresh_token')

    const bootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: false
      })
    })
    const bootstrapCookies = getSetCookieHeaders(bootstrapResponse)
    const cookieHeader = [
      extractCookie(bootstrapCookies, 'nebulynk_refresh_session'),
      extractCookie(bootstrapCookies, 'nebulynk_csrf_token')
    ].filter(Boolean).join('; ')

    const csrfFailureResponse = await fetch(`${harness.baseUrl}/auth/session/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
      },
      body: JSON.stringify({})
    })
    const csrfFailurePayload = await csrfFailureResponse.json()

    assert.equal(csrfFailureResponse.status, 403)
    assert.equal(csrfFailurePayload.error_code, 'api.auth_session.invalid_csrf_token')

    const missingLog = loggerCalls.find((call) => call.message === 'Auth session refresh missing refresh token')
    assert.ok(missingLog)
    assert.equal(missingLog.meta.authSessionDebugId, 'auth-debug-missing')
    assert.equal(missingLog.meta.transport, 'body')
    assert.equal(missingLog.meta.refreshCookiePresent, false)
    assert.equal(missingLog.meta.csrfHeaderPresent, false)

    const invalidLog = loggerCalls.find((call) => call.message === 'Auth session refresh rejected')
    assert.ok(invalidLog)
    assert.equal(invalidLog.meta.authSessionDebugId, 'auth-debug-invalid')
    assert.equal(invalidLog.meta.errorCode, 'api.auth_session.invalid_refresh_token')
    assert.equal(invalidLog.meta.transport, 'body')
    assert.equal(invalidLog.meta.bodyRefreshTokenPresent, true)

    const csrfLog = loggerCalls.find((call) => call.message === 'Auth session refresh CSRF validation failed')
    assert.ok(csrfLog)
    assert.equal(csrfLog.meta.transport, 'cookie')
    assert.equal(csrfLog.meta.refreshCookiePresent, true)
    assert.equal(csrfLog.meta.csrfCookiePresent, true)
    assert.equal(csrfLog.meta.csrfHeaderPresent, false)
    assert.equal(csrfLog.meta.csrfMatches, false)
  } finally {
    logger.warn = originalLoggerWarn
    await harness.close()
  }
})

test('auth session delete revokes a cookie session and clears cookies', async () => {
  const harness = await createHarness()

  try {
    const bootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: false
      })
    })
    const bootstrapCookies = getSetCookieHeaders(bootstrapResponse)
    const csrfToken = extractCookieValue(bootstrapCookies, 'nebulynk_csrf_token')
    const cookieHeader = [
      extractCookie(bootstrapCookies, 'nebulynk_refresh_session'),
      extractCookie(bootstrapCookies, 'nebulynk_csrf_token')
    ].filter(Boolean).join('; ')

    const deleteResponse = await fetch(`${harness.baseUrl}/auth/session`, {
      method: 'DELETE',
      headers: {
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({})
    })

    assert.equal(deleteResponse.status, 204)
    assert.ok(harness.db._state.auth_sessions[0].revoked_at)
    assert.ok(getSetCookieHeaders(deleteResponse).some((header) => header.includes('expires=Thu, 01 Jan 1970 00:00:00 GMT')))
  } finally {
    await harness.close()
  }
})

test('auth session delete revokes a body session and clears any stale cookies', async () => {
  const harness = await createHarness()

  try {
    const bootstrapResponse = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transport: 'body',
        remember: false
      })
    })
    const bootstrapPayload = await bootstrapResponse.json()

    const deleteResponse = await fetch(`${harness.baseUrl}/auth/session`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Refresh-Token': bootstrapPayload.refreshToken
      },
      body: JSON.stringify({
        refreshToken: bootstrapPayload.refreshToken
      })
    })

    assert.equal(deleteResponse.status, 204)
    assert.ok(harness.db._state.auth_sessions[0].revoked_at)
    assert.ok(getSetCookieHeaders(deleteResponse).some((header) => header.includes('expires=Thu, 01 Jan 1970 00:00:00 GMT')))
  } finally {
    await harness.close()
  }
})

test('auth session bootstrap logs unexpected failures before returning the generic error payload', async () => {
  const harness = await createHarness({
    dbOptions: {
      authSessions: {
        failInsert: true
      }
    }
  })
  const originalLoggerError = logger.error
  const loggerCalls = []
  logger.error = (message, meta) => {
    loggerCalls.push({ message, meta })
  }

  try {
    const response = await fetch(`${harness.baseUrl}/auth/session/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-access-token',
        'Content-Type': 'application/json',
        'User-Agent': 'auth-session-test-agent'
      },
      body: JSON.stringify({
        transport: 'cookie',
        remember: false
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 500)
    assert.equal(payload.error_code, 'api.auth_session.unexpected_error')
    assert.equal(loggerCalls.length, 1)
    assert.equal(loggerCalls[0].message, 'Auth session route failed unexpectedly')
    assert.equal(loggerCalls[0].meta.path, '/auth/session/bootstrap')
    assert.equal(loggerCalls[0].meta.method, 'POST')
    assert.equal(loggerCalls[0].meta.userAgent, 'auth-session-test-agent')
    assert.match(loggerCalls[0].meta.error, /insert failed unexpectedly/)
  } finally {
    logger.error = originalLoggerError
    await harness.close()
  }
})
