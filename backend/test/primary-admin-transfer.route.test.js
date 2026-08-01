import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa, bodyParser } from '@feathersjs/koa'
import { createMemoryDb } from './helpers/memory-db.js'
import { configurePrimaryAdminTransferRoutes } from '../src/routes/primary-admin-transfer.js'
import { users } from '../src/services/users/users.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'
import { encodeBytesForStorage } from '../src/lib/passkeys.js'

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
        id: 'primary-1',
        email: 'primary@example.com',
        password: 'primary-password',
        display_name: 'Primary Admin',
        account_type: 'member',
        is_admin: true,
        is_primary_admin: true,
        disabled_at: null,
        webauthn_user_id: 'primary-webauthn-user'
      },
      {
        id: 'member-1',
        email: 'member@example.com',
        password: 'member-password',
        display_name: 'Member',
        account_type: 'member',
        is_admin: false,
        is_primary_admin: false,
        disabled_at: null,
        webauthn_user_id: 'member-webauthn-user'
      },
      {
        id: 'manager-1',
        email: 'manager@example.com',
        password: 'manager-password',
        display_name: 'Manager',
        account_type: 'member',
        is_admin: false,
        is_primary_admin: false,
        disabled_at: null,
        webauthn_user_id: 'manager-webauthn-user'
      },
      {
        id: 'disabled-1',
        email: 'disabled@example.com',
        password: 'disabled-password',
        display_name: 'Disabled',
        account_type: 'member',
        is_admin: false,
        is_primary_admin: false,
        disabled_at: '2026-06-19T10:00:00.000Z',
        webauthn_user_id: 'disabled-webauthn-user'
      },
      {
        id: 'guest-1',
        email: 'guest@example.com',
        password: 'guest-password',
        display_name: 'Guest',
        account_type: 'guest',
        is_admin: false,
        is_primary_admin: false,
        disabled_at: null,
        webauthn_user_id: 'guest-webauthn-user'
      }
    ],
    permissions: [
      { id: 'perm-manage-users', name: 'manage_users' }
    ],
    roles: [
      { id: 'role-admin', name: 'platform:admin', scope: 'platform', is_system: true },
      { id: 'role-manager', name: 'platform:manager', scope: 'platform', is_system: false }
    ],
    role_permissions: [
      { id: 'role-perm-1', role_id: 'role-manager', permission_id: 'perm-manage-users' }
    ],
    user_roles: [
      { id: 'user-role-primary', user_id: 'primary-1', role_id: 'role-admin' },
      { id: 'user-role-manager', user_id: 'manager-1', role_id: 'role-manager' }
    ],
    auth_sessions: [
      {
        id: 'session-member',
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
        created_at: '2026-06-19T00:00:00.000Z',
        updated_at: '2026-06-19T00:00:00.000Z'
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
      return { user: { ...user }, accessToken: 'token' }
    },
    async verifyAccessToken(token) {
      const mapping = {
        'primary-token': 'primary-1',
        'manager-token': 'manager-1',
        'member-token': 'member-1'
      }
      const userId = mapping[token]
      if (!userId) throw new Error('Invalid token')
      return { sub: userId }
    }
  }
}

function createPasskeyHelpers() {
  return {
    async generateAuthenticationOptions() {
      return {
        challenge: 'primary-transfer-challenge',
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
          newCounter: 42,
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
  configurePrimaryAdminTransferRoutes(app)

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

async function postTransfer(harness, token, body) {
  const response = await fetch(`${harness.baseUrl}/admin/primary-admin-transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  return { response, payload: await response.json() }
}

test('primary-admin transfer requires the current primary admin, not just manage_users', async () => {
  const harness = await createRouteHarness()
  try {
    const { response, payload } = await postTransfer(harness, 'manager-token', {
      target_user_id: 'member-1',
      confirmation: 'TRANSFER_PRIMARY_ADMIN',
      reauth: { method: 'password', current_password: 'manager-password' }
    })

    assert.equal(response.status, 403)
    assert.equal(payload.error_code, 'api.primary_admin.current_primary_admin_required')
  } finally {
    await harness.close()
  }
})

test('primary-admin transfer rejects missing confirmation and wrong password', async () => {
  const harness = await createRouteHarness()
  try {
    const missingConfirmation = await postTransfer(harness, 'primary-token', {
      target_user_id: 'member-1',
      reauth: { method: 'password', current_password: 'primary-password' }
    })
    assert.equal(missingConfirmation.response.status, 400)
    assert.equal(missingConfirmation.payload.error_code, 'api.primary_admin.confirmation_required')

    const wrongPassword = await postTransfer(harness, 'primary-token', {
      target_user_id: 'member-1',
      confirmation: 'TRANSFER_PRIMARY_ADMIN',
      reauth: { method: 'password', current_password: 'wrong-password' }
    })
    assert.equal(wrongPassword.response.status, 400)
    assert.equal(wrongPassword.payload.error_code, 'api.primary_admin.invalid_current_password')
  } finally {
    await harness.close()
  }
})

test('primary-admin transfer rejects self, guest, and disabled targets', async () => {
  const harness = await createRouteHarness()
  try {
    for (const [targetUserId, expectedCode] of [
      ['primary-1', 'api.primary_admin.self_transfer_not_allowed'],
      ['guest-1', 'api.primary_admin.target_must_be_active_member'],
      ['disabled-1', 'api.authentication.account_disabled']
    ]) {
      const { response, payload } = await postTransfer(harness, 'primary-token', {
        target_user_id: targetUserId,
        confirmation: 'TRANSFER_PRIMARY_ADMIN',
        reauth: { method: 'password', current_password: 'primary-password' }
      })
      assert.equal(response.status, targetUserId === 'disabled-1' ? 403 : 400)
      assert.equal(payload.error_code, expectedCode)
    }
  } finally {
    await harness.close()
  }
})

test('primary-admin transfer moves ownership, promotes target to admin, and keeps old admin rights', async () => {
  const harness = await createRouteHarness()
  try {
    const { response, payload } = await postTransfer(harness, 'primary-token', {
      target_user_id: 'member-1',
      confirmation: 'TRANSFER_PRIMARY_ADMIN',
      reauth: { method: 'password', current_password: 'primary-password' }
    })

    assert.equal(response.status, 200)
    assert.deepEqual(payload, {
      ok: true,
      previous_primary_admin_id: 'primary-1',
      primary_admin_id: 'member-1'
    })

    const oldAdmin = harness.db.tables.users.find((entry) => entry.id === 'primary-1')
    const newAdmin = harness.db.tables.users.find((entry) => entry.id === 'member-1')
    assert.equal(oldAdmin.is_admin, true)
    assert.equal(oldAdmin.is_primary_admin, false)
    assert.equal(newAdmin.is_admin, true)
    assert.equal(newAdmin.is_primary_admin, true)
    assert.ok(harness.db.tables.user_roles.find((entry) => entry.user_id === 'member-1' && entry.role_id === 'role-admin'))
    assert.ok(harness.db.tables.auth_sessions.find((entry) => entry.id === 'session-member').revoked_at)
  } finally {
    await harness.close()
  }
})

test('primary-admin transfer supports passkey reauthentication', async () => {
  const harness = await createRouteHarness({
    user_passkeys: [{
      id: 'passkey-1',
      user_id: 'primary-1',
      credential_id: 'credential-primary',
      public_key: encodeBytesForStorage(new Uint8Array([1, 2, 3, 4])),
      counter: 1,
      device_type: 'singleDevice',
      backed_up: false,
      transports: JSON.stringify(['internal']),
      name: 'Laptop',
      last_used_at: null,
      created_at: '2026-06-19T00:00:00.000Z',
      updated_at: '2026-06-19T00:00:00.000Z'
    }]
  })

  try {
    const optionsResponse = await fetch(`${harness.baseUrl}/admin/primary-admin-transfer/passkey-options`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer primary-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    const optionsPayload = await optionsResponse.json()
    assert.equal(optionsResponse.status, 200)
    assert.equal(optionsPayload.options.challenge, 'primary-transfer-challenge')

    const { response } = await postTransfer(harness, 'primary-token', {
      target_user_id: 'member-1',
      confirmation: 'TRANSFER_PRIMARY_ADMIN',
      reauth: {
        method: 'passkey',
        challenge_id: optionsPayload.challengeId,
        authentication_response: { id: 'credential-primary' }
      }
    })

    assert.equal(response.status, 200)
    assert.equal(harness.db.tables.users.find((entry) => entry.id === 'member-1').is_primary_admin, true)
    assert.equal(harness.db.tables.user_passkeys[0].counter, 42)
    assert.ok(harness.db.tables.auth_passkey_challenges[0].used_at)
  } finally {
    await harness.close()
  }
})

test('users.remove blocks deleting the primary admin account', async () => {
  const db = createMemoryDb(createSeed())
  const app = feathers()
  app.set('postgresqlClient', db)
  app.set('paginate', false)
  app.defaultAuthentication = () => ({
    async authenticate() {
      return { user: db.tables.users.find((entry) => entry.id === 'manager-1') }
    }
  })
  app.use('authentication', createAuthService(db))
  users(app)

  await assert.rejects(
    app.service('users').remove('primary-1', {
      provider: 'rest',
      authenticated: true,
      user: db.tables.users.find((entry) => entry.id === 'manager-1'),
      resolvedPermissions: new Set(['manage_users'])
    }),
    (error) => {
      assert.equal(error.error_code, 'api.primary_admin.cannot_delete_primary_admin')
      return true
    }
  )
})

test('primary-admin migration defines a unique durable primary-admin seed', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../migrations/056_primary_admin.js', import.meta.url), 'utf8'))

  assert.match(source, /is_primary_admin/)
  assert.match(source, /CREATE UNIQUE INDEX users_primary_admin_unique/)
  assert.match(source, /where\(\{ is_admin: true \}\)/)
  assert.match(source, /orderBy\('created_at', 'asc'\)/)
})
