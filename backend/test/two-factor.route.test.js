import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { createMemoryDb } from './helpers/memory-db.js'
import { configureAuthLoginRoutes } from '../src/routes/auth-login.js'
import { configureUserTwoFactorRoutes } from '../src/routes/user-two-factor.js'
import { configureUserPasskeyRoutes } from '../src/routes/user-passkeys.js'
import { users } from '../src/services/users/users.js'
import { encryptTwoFactorSecret } from '../src/lib/two-factor-secrets.js'
import { createId } from '@paralleldrive/cuid2'
import { generateRecoveryCodes, generateTotpCode, generateTotpSecret } from '../src/lib/two-factor.js'
import { encodeBytesForStorage } from '../src/lib/passkeys.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

function createNotAuthenticatedError() {
  const error = new Error('Invalid credentials')
  error.name = 'NotAuthenticated'
  error.className = 'not-authenticated'
  return error
}

function createSeed() {
  return {
    users: [
      {
        id: 'member-1',
        email: 'member@example.com',
        password: 'member-password',
        display_name: 'Member',
        account_type: 'member',
        is_admin: false,
        disabled_at: null,
        meeting_video_preferences: null,
        webauthn_user_id: 'member-webauthn-user'
      },
      {
        id: 'manager-1',
        email: 'manager@example.com',
        password: 'manager-password',
        display_name: 'Manager',
        account_type: 'member',
        is_admin: false,
        disabled_at: null,
        meeting_video_preferences: null,
        webauthn_user_id: 'manager-webauthn-user'
      },
      {
        id: 'admin-1',
        email: 'admin@example.com',
        password: 'admin-password',
        display_name: 'Admin',
        account_type: 'member',
        is_admin: true,
        disabled_at: null,
        meeting_video_preferences: null,
        webauthn_user_id: 'admin-webauthn-user'
      },
      {
        id: 'guest-1',
        email: 'guest@example.com',
        password: 'guest-password',
        display_name: 'Guest',
        account_type: 'guest',
        is_admin: false,
        disabled_at: null,
        meeting_video_preferences: null,
        webauthn_user_id: 'guest-webauthn-user'
      }
    ],
    permissions: [
      { id: 'perm-manage-users', name: 'manage_users' }
    ],
    roles: [
      { id: 'role-manager', name: 'platform:manager', scope: 'platform', is_system: false }
    ],
    role_permissions: [
      { id: 'role-perm-1', role_id: 'role-manager', permission_id: 'perm-manage-users' }
    ],
    user_roles: [
      { id: 'user-role-1', user_id: 'manager-1', role_id: 'role-manager' }
    ],
    auth_sessions: [
      {
        id: 'session-1',
        user_id: 'member-1',
        refresh_token_hash: 'hash',
        transport: 'cookie',
        is_persistent: false,
        expires_at: '2099-01-01T00:00:00.000Z',
        last_used_at: null,
        revoked_at: null,
        created_ip: null,
        last_used_ip: null,
        user_agent: null,
        created_at: '2026-05-14T00:00:00.000Z',
        updated_at: '2026-05-14T00:00:00.000Z'
      }
    ]
  }
}

function createAuthService(db) {
  return {
    async create(data) {
      const email = String(data?.email || '').trim().toLowerCase()
      const password = String(data?.password || '')
      const user = db.tables.users.find((entry) => entry.email === email)
      if (!user || user.password !== password) {
        throw createNotAuthenticatedError()
      }

      return {
        accessToken: 'browser-login-token',
        user: { ...user }
      }
    },
    async verifyAccessToken(token) {
      const mapping = {
        'member-token': 'member-1',
        'manager-token': 'manager-1',
        'admin-token': 'admin-1',
        'guest-token': 'guest-1'
      }
      const userId = mapping[token]
      if (!userId) {
        throw new Error('Invalid token')
      }
      return { sub: userId }
    },
    async createAccessToken(_payload, options = {}) {
      return options.expiresIn === '15m' ? 'issued-browser-token' : 'issued-token'
    }
  }
}

function createPasskeyHelpers() {
  return {
    async generateAuthenticationOptions() {
      return {
        challenge: 'passkey-auth-challenge',
        rpId: '127.0.0.1'
      }
    },
    async verifyAuthenticationResponse({ response, credential }) {
      if (!response?.id || response.id !== credential.id) {
        throw new Error('Credential mismatch')
      }

      return {
        verified: true,
        authenticationInfo: {
          credentialID: credential.id,
          newCounter: 42,
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://127.0.0.1:5173',
          rpID: '127.0.0.1'
        }
      }
    },
    async generateRegistrationOptions() {
      return {
        challenge: 'passkey-registration-challenge',
        rp: {
          id: '127.0.0.1',
          name: 'Nebulynk'
        }
      }
    },
    async verifyRegistrationResponse({ response }) {
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: response?.id || 'passkey-credential-1',
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 0
          },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true
        }
      }
    }
  }
}

async function createRouteHarness(seed = {}) {
  const app = koa(feathers())
  const db = createMemoryDb({
    ...createSeed(),
    ...seed
  })

  app.set('postgresqlClient', db)
  app.set('authentication', {
    browserJwtOptions: { expiresIn: '15m' }
  })
  app.set('frontendOrigins', ['http://127.0.0.1:5173'])
  app.set('passkeyRpId', '127.0.0.1')
  app.set('passkeyHelpers', createPasskeyHelpers())
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore()))

  const authService = createAuthService(db)
  const originalService = app.service.bind(app)
  app.service = (name) => {
    if (name === 'authentication') return authService
    return originalService(name)
  }

  app.use(bodyParser())
  configureAuthLoginRoutes(app)
  configureUserTwoFactorRoutes(app)
  configureUserPasskeyRoutes(app)

  const server = createServer(app.callback())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    app,
    db,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  }
}

test('POST /auth/login returns a direct browser auth result when 2FA is disabled', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'member-password',
        remember: true
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.accessToken, 'browser-login-token')
    assert.equal(payload.user.id, 'member-1')
    assert.equal(harness.db.tables.auth_login_challenges.length, 0)
  } finally {
    await harness.close()
  }
})

test('POST /auth/login creates a 2FA challenge when the member has TOTP enabled', async () => {
  const secret = generateTotpSecret()
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret),
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }]
  })
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const response = await fetch(`${harness.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'member-password',
        remember: false
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.requiresTwoFactor, true)
    assert.equal(payload.availableMethods[0], 'totp')
    assert.equal(harness.db.tables.auth_login_challenges.length, 1)
  } finally {
    await harness.close()
  }
})

test('POST /auth/login/verify-2fa accepts a valid TOTP code and consumes the challenge', async () => {
  const secret = generateTotpSecret()
  const encryptedSecret = encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret)
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptedSecret,
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }]
  })
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const loginResponse = await fetch(`${harness.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'member-password',
        remember: true
      })
    })
    const loginPayload = await loginResponse.json()

    const verifyResponse = await fetch(`${harness.baseUrl}/auth/login/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: loginPayload.challengeId,
        method: 'totp',
        code: generateTotpCode(secret)
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 200)
    assert.equal(verifyPayload.accessToken, 'issued-browser-token')
    assert.equal(verifyPayload.user.id, 'member-1')
    assert.ok(harness.db.tables.auth_login_challenges[0].consumed_at)
    assert.ok(harness.db.tables.user_two_factor[0].last_used_at)
  } finally {
    await harness.close()
  }
})

test('POST /auth/login/verify-2fa rejects disabled users before issuing a token', async () => {
  const secret = generateTotpSecret()
  const encryptedSecret = encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret)
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptedSecret,
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }]
  })
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const loginResponse = await fetch(`${harness.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'member-password',
        remember: true
      })
    })
    const loginPayload = await loginResponse.json()

    harness.db.tables.users.find((entry) => entry.id === 'member-1').disabled_at = '2026-06-14T10:00:00.000Z'

    const verifyResponse = await fetch(`${harness.baseUrl}/auth/login/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: loginPayload.challengeId,
        method: 'totp',
        code: generateTotpCode(secret)
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 403)
    assert.equal(verifyPayload.error_code, 'api.authentication.account_disabled')
    assert.equal(Object.prototype.hasOwnProperty.call(verifyPayload, 'accessToken'), false)
    assert.equal(harness.db.tables.auth_login_challenges[0].consumed_at, null)
  } finally {
    await harness.close()
  }
})

test('POST /auth/login/verify-2fa is rate-limited per challenge', async () => {
  const secret = generateTotpSecret()
  const encryptedSecret = encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret)
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptedSecret,
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }]
  })
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const loginResponse = await fetch(`${harness.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'member@example.com',
        password: 'member-password',
        remember: true
      })
    })
    const loginPayload = await loginResponse.json()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${harness.baseUrl}/auth/login/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: loginPayload.challengeId,
          method: 'totp',
          code: '000000'
        })
      })
      assert.equal(response.status, 400)
    }

    const limitedResponse = await fetch(`${harness.baseUrl}/auth/login/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: loginPayload.challengeId,
        method: 'totp',
        code: '000000'
      })
    })
    const limitedPayload = await limitedResponse.json()

    assert.equal(limitedResponse.status, 429)
    assert.equal(limitedPayload.error_code, 'api.authentication.rate_limited')
  } finally {
    await harness.close()
  }
})

test('self-service 2FA setup and confirmation creates active TOTP plus recovery codes', async () => {
  const harness = await createRouteHarness()
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const setupResponse = await fetch(`${harness.baseUrl}/users/me/2fa/setup`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    const setupPayload = await setupResponse.json()
    const setupUrl = new URL(setupPayload.otpauthUrl)
    const secret = setupUrl.searchParams.get('secret')

    const confirmResponse = await fetch(`${harness.baseUrl}/users/me/2fa/confirm`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'member-password',
        code: generateTotpCode(secret)
      })
    })
    const confirmPayload = await confirmResponse.json()

    assert.equal(setupResponse.status, 200)
    assert.equal(typeof setupPayload.manualKey, 'string')
    assert.ok(setupPayload.manualKey.length > 0)
    assert.equal(typeof setupPayload.qrSvg, 'string')
    assert.match(setupPayload.qrSvg, /<svg[\s\S]*role="img"/)
    assert.match(setupPayload.qrSvg, /shape-rendering="crispEdges"/)
    assert.doesNotMatch(setupPayload.qrSvg, /Fallback setup card/i)
    assert.equal(confirmResponse.status, 200)
    assert.equal(confirmPayload.enabled, true)
    assert.equal(confirmPayload.recoveryCodes.length, 10)
    assert.equal(harness.db.tables.user_two_factor.length, 1)
    assert.equal(harness.db.tables.user_two_factor_recovery_codes.length, 10)
    assert.equal(harness.db.tables.user_two_factor_pending.length, 0)
  } finally {
    await harness.close()
  }
})

test('guest accounts are blocked from self-service 2FA setup', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/users/me/2fa/setup`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer guest-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.two_factor.guest_accounts_forbidden')
  } finally {
    await harness.close()
  }
})

test('self-service recovery-code regeneration and disable clear and replace the correct 2FA records', async () => {
  const secret = generateTotpSecret()
  const encryptedSecret = encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret)
  const initialRecoveryCodes = generateRecoveryCodes()
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptedSecret,
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }],
    user_two_factor_recovery_codes: initialRecoveryCodes.map((entry, index) => ({
      id: `recovery-${index}`,
      user_id: 'member-1',
      code_hash: entry.code_hash,
      used_at: null,
      created_at: '2026-05-14T12:00:00.000Z'
    }))
  })
  harness.app.set('authentication', {
    secret: 'test-auth-secret',
    browserJwtOptions: { expiresIn: '15m' }
  })

  try {
    const regenerateResponse = await fetch(`${harness.baseUrl}/users/me/2fa/recovery-codes/regenerate`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'member-password',
        code: generateTotpCode(secret)
      })
    })
    const regeneratePayload = await regenerateResponse.json()
    const recoveryHashes = new Set(harness.db.tables.user_two_factor_recovery_codes.map((entry) => entry.code_hash))

    assert.equal(regenerateResponse.status, 200)
    assert.equal(regeneratePayload.recoveryCodes.length, 10)
    for (const previous of initialRecoveryCodes) {
      assert.equal(recoveryHashes.has(previous.code_hash), false)
    }

    const disableResponse = await fetch(`${harness.baseUrl}/users/me/2fa/disable`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'member-password',
        code: generateTotpCode(secret)
      })
    })
    const disablePayload = await disableResponse.json()

    assert.equal(disableResponse.status, 200)
    assert.equal(disablePayload.enabled, false)
    assert.equal(harness.db.tables.user_two_factor.length, 0)
    assert.equal(harness.db.tables.user_two_factor_recovery_codes.length, 0)
  } finally {
    await harness.close()
  }
})

test('admin reset removes user 2FA state and revokes refresh sessions', async () => {
  const secret = generateTotpSecret()
  const encryptedSecret = encryptTwoFactorSecret({ get: () => ({ secret: 'test-auth-secret' }) }, secret)
  const harness = await createRouteHarness({
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: encryptedSecret,
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }],
    user_two_factor_pending: [{
      user_id: 'member-1',
      encrypted_secret: encryptedSecret,
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }],
    user_two_factor_recovery_codes: [{
      id: 'recovery-1',
      user_id: 'member-1',
      code_hash: 'hash',
      used_at: null,
      created_at: '2026-05-14T12:00:00.000Z'
    }]
  })

  try {
    const response = await fetch(`${harness.baseUrl}/users/member-1/2fa/reset`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer manager-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(harness.db.tables.user_two_factor.length, 0)
    assert.equal(harness.db.tables.user_two_factor_pending.length, 0)
    assert.equal(harness.db.tables.user_two_factor_recovery_codes.length, 0)
    assert.ok(harness.db.tables.auth_sessions[0].revoked_at)
  } finally {
    await harness.close()
  }
})

test('POST /auth/passkeys/authentication-options creates a public passkey login challenge', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        remember: false
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.challengeId, harness.db.tables.auth_passkey_challenges[0].id)
    assert.equal(payload.options.challenge, 'passkey-auth-challenge')
  } finally {
    await harness.close()
  }
})

test('POST /auth/passkeys/authentication-options is rate-limited per IP', async () => {
  const harness = await createRouteHarness()

  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remember: false
        })
      })
      assert.equal(response.status, 200)
    }

    const limitedResponse = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remember: false
      })
    })
    const limitedPayload = await limitedResponse.json()

    assert.equal(limitedResponse.status, 429)
    assert.equal(limitedPayload.error_code, 'api.passkeys.rate_limited')
  } finally {
    await harness.close()
  }
})

test('POST /auth/passkeys/verify-authentication accepts a valid passkey and updates the counter', async () => {
  const harness = await createRouteHarness({
    user_passkeys: [{
      id: 'passkey-1',
      user_id: 'member-1',
      credential_id: 'credential-1',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3, 4])),
      counter: 1,
      device_type: 'singleDevice',
      backed_up: false,
      transports: JSON.stringify(['internal']),
      name: 'Laptop',
      last_used_at: null,
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z'
    }]
  })

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        remember: true
      })
    })
    const optionsPayload = await optionsResponse.json()

    const verifyResponse = await fetch(`${harness.baseUrl}/auth/passkeys/verify-authentication`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        authenticationResponse: {
          id: 'credential-1'
        }
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 200)
    assert.equal(verifyPayload.accessToken, 'issued-browser-token')
    assert.equal(verifyPayload.user.id, 'member-1')
    assert.equal(harness.db.tables.user_passkeys[0].counter, 42)
    assert.equal(harness.db.tables.user_passkeys[0].backed_up, true)
    assert.ok(harness.db.tables.auth_passkey_challenges[0].used_at)
  } finally {
    await harness.close()
  }
})

test('POST /auth/passkeys/verify-authentication rejects disabled passkey owners before issuing a token', async () => {
  const harness = await createRouteHarness({
    users: createSeed().users.map((user) => user.id === 'member-1'
      ? { ...user, disabled_at: '2026-06-14T10:00:00.000Z' }
      : user),
    user_passkeys: [{
      id: 'passkey-1',
      user_id: 'member-1',
      credential_id: 'credential-1',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3, 4])),
      counter: 1,
      device_type: 'singleDevice',
      backed_up: false,
      transports: JSON.stringify(['internal']),
      name: 'Laptop',
      last_used_at: null,
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z'
    }]
  })

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remember: true
      })
    })
    const optionsPayload = await optionsResponse.json()

    const verifyResponse = await fetch(`${harness.baseUrl}/auth/passkeys/verify-authentication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        authenticationResponse: {
          id: 'credential-1'
        }
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 403)
    assert.equal(verifyPayload.error_code, 'api.authentication.account_disabled')
    assert.equal(Object.prototype.hasOwnProperty.call(verifyPayload, 'accessToken'), false)
    assert.equal(harness.db.tables.user_passkeys[0].counter, 1)
    assert.equal(harness.db.tables.auth_passkey_challenges[0].used_at, null)
  } finally {
    await harness.close()
  }
})

test('POST /auth/passkeys/verify-authentication is rate-limited per challenge', async () => {
  const harness = await createRouteHarness()

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/auth/passkeys/authentication-options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        remember: true
      })
    })
    const optionsPayload = await optionsResponse.json()

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${harness.baseUrl}/auth/passkeys/verify-authentication`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: optionsPayload.challengeId,
          authenticationResponse: null
        })
      })
      assert.equal(response.status, 400)
    }

    const limitedResponse = await fetch(`${harness.baseUrl}/auth/passkeys/verify-authentication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        authenticationResponse: null
      })
    })
    const limitedPayload = await limitedResponse.json()

    assert.equal(limitedResponse.status, 429)
    assert.equal(limitedPayload.error_code, 'api.passkeys.rate_limited')
  } finally {
    await harness.close()
  }
})

test('member passkey registration options require current password and registration stores the passkey', async () => {
  const harness = await createRouteHarness()

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/users/me/passkeys/registration-options`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'member-password'
      })
    })
    const optionsPayload = await optionsResponse.json()

    assert.equal(optionsResponse.status, 200)
    assert.equal(optionsPayload.options.challenge, 'passkey-registration-challenge')
    assert.equal(harness.db.tables.auth_passkey_challenges.length, 1)

    const verifyResponse = await fetch(`${harness.baseUrl}/users/me/passkeys/verify-registration`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        registrationResponse: {
          id: 'credential-registered-1',
          response: {
            transports: ['internal']
          }
        },
        name: 'Office laptop'
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 200)
    assert.equal(verifyPayload.passkey.name, 'Office laptop')
    assert.equal(harness.db.tables.user_passkeys.length, 1)
    assert.equal(harness.db.tables.user_passkeys[0].credential_id, 'credential-registered-1')
    assert.equal(harness.db.tables.user_passkeys[0].transports, JSON.stringify(['internal']))
  } finally {
    await harness.close()
  }
})

test('passkey registration rejects an already-registered credential', async () => {
  const harness = await createRouteHarness({
    user_passkeys: [{
      id: 'passkey-existing',
      user_id: 'member-1',
      credential_id: 'credential-duplicate',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3])),
      counter: 0,
      device_type: 'multiDevice',
      backed_up: true,
      transports: JSON.stringify(['internal']),
      name: 'Existing',
      last_used_at: null,
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z'
    }]
  })

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/users/me/passkeys/registration-options`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'member-password'
      })
    })
    const optionsPayload = await optionsResponse.json()

    const verifyResponse = await fetch(`${harness.baseUrl}/users/me/passkeys/verify-registration`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer member-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeId: optionsPayload.challengeId,
        registrationResponse: {
          id: 'credential-duplicate',
          response: {
            transports: ['internal']
          }
        }
      })
    })
    const verifyPayload = await verifyResponse.json()

    assert.equal(verifyResponse.status, 409)
    assert.equal(verifyPayload.error_code, 'api.passkeys.credential_already_registered')
    assert.equal(harness.db.tables.user_passkeys.length, 1)
  } finally {
    await harness.close()
  }
})

test('guest accounts are blocked from passkey self-service', async () => {
  const harness = await createRouteHarness()

  try {
    const response = await fetch(`${harness.baseUrl}/users/me/passkeys/registration-options`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer guest-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        current_password: 'guest-password'
      })
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.passkeys.guest_accounts_forbidden')
  } finally {
    await harness.close()
  }
})

test('admin reset removes user passkeys and revokes refresh sessions', async () => {
  const harness = await createRouteHarness({
    user_passkeys: [{
      id: 'passkey-1',
      user_id: 'member-1',
      credential_id: 'credential-1',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3])),
      counter: 0,
      device_type: 'multiDevice',
      backed_up: true,
      transports: JSON.stringify(['internal']),
      name: 'Laptop',
      last_used_at: null,
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z'
    }]
  })

  try {
    const response = await fetch(`${harness.baseUrl}/users/member-1/passkeys/reset`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer manager-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.passkey_count, 0)
    assert.equal(harness.db.tables.user_passkeys.length, 0)
    assert.ok(harness.db.tables.auth_sessions[0].revoked_at)
  } finally {
    await harness.close()
  }
})

test('users.find exposes two-factor and passkey admin status only to requesters with manage_users', async () => {
  const app = feathers()
  const db = createMemoryDb({
    ...createSeed(),
    user_two_factor: [{
      user_id: 'member-1',
      method: 'totp',
      encrypted_secret: 'encrypted',
      enabled_at: '2026-05-14T12:00:00.000Z',
      last_used_at: null,
      created_at: '2026-05-14T12:00:00.000Z',
      updated_at: '2026-05-14T12:00:00.000Z'
    }],
    user_passkeys: [{
      id: 'passkey-1',
      user_id: 'member-1',
      credential_id: 'credential-1',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3])),
      counter: 0,
      device_type: 'multiDevice',
      backed_up: true,
      transports: JSON.stringify(['internal']),
      name: 'Laptop',
      last_used_at: null,
      created_at: '2026-05-15T12:00:00.000Z',
      updated_at: '2026-05-15T12:00:00.000Z'
    }]
  })

  app.set('postgresqlClient', db)
  app.defaultAuthentication = () => ({
    async authenticate(authentication, params) {
      return {
        authentication,
        user: params.user
      }
    }
  })
  app.set('authentication', {
    secret: 'test-auth-secret'
  })
  const authService = createAuthService(db)
  const originalService = app.service.bind(app)
  app.service = (name) => {
    if (name === 'authentication') return authService
    return originalService(name)
  }

  app.configure(users)

  const managerResult = await app.service('users').find({
    provider: 'rest',
    authentication: {
      strategy: 'jwt'
    },
    user: db.tables.users.find((entry) => entry.id === 'manager-1'),
    query: {
      ids: ['member-1'],
      $limit: 1
    }
  })
  const memberResult = await app.service('users').find({
    provider: 'rest',
    authentication: {
      strategy: 'jwt'
    },
    user: db.tables.users.find((entry) => entry.id === 'member-1'),
    query: {
      ids: ['member-1'],
      $limit: 1
    }
  })

  assert.equal(managerResult.data[0].two_factor_enabled, true)
  assert.equal(managerResult.data[0].passkey_count, 1)
  assert.equal(managerResult.data[0].passkeys_enabled, true)
  assert.equal(Object.prototype.hasOwnProperty.call(memberResult.data[0], 'two_factor_enabled'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(memberResult.data[0], 'passkey_count'), false)
})
