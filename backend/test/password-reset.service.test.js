import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { passwordReset } from '../src/services/password-reset/password-reset.js'
import { hashPasswordResetToken } from '../src/lib/password-reset.js'
import { createMemoryDb } from './helpers/memory-db.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

function createHarness({
  seed = {},
  now = '2026-05-11T12:00:00.000Z',
  sendResetEmail = async () => ({ ok: true, source: 'admin' })
} = {}) {
  const db = createMemoryDb({
    users: [],
    password_resets: [],
    auth_sessions: [],
    platform_settings: [
      { key: 'platform_name', value: 'Nebulynk' },
      { key: 'default_locale', value: 'en' }
    ],
    ...seed
  })
  const calls = {
    userPatches: [],
    revokedUserIds: [],
    sentEmails: []
  }
  const app = feathers()
  app.set('postgresqlClient', db)
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore({ now: () => new Date(now).getTime() }), {
    now: () => new Date(now).getTime()
  }))
  app.use('users', {
    async patch(id, data) {
      calls.userPatches.push({ id, data })
      const user = db.tables.users.find((entry) => entry.id === id)
      if (user) {
        Object.assign(user, data)
      }
      return user || { id, ...data }
    }
  })

  passwordReset(app, {
    now: () => new Date(now),
    createToken: () => 'reset-token-1',
    sendResetEmail: async (serviceApp, payload) => {
      calls.sentEmails.push(payload)
      return sendResetEmail(serviceApp, payload)
    },
    revokeRefreshSessions: async (serviceApp, userId) => {
      calls.revokedUserIds.push(userId)
      const nowIso = new Date(now).toISOString()
      await serviceApp.get('postgresqlClient')('auth_sessions')
        .where('user_id', userId)
        .whereNull('revoked_at')
        .update({
          revoked_at: nowIso,
          updated_at: nowIso
        })
    }
  })

  return {
    app,
    db,
    calls
  }
}

test('password-reset.create stores a hashed token and sends a locale-aware email for eligible members', async () => {
  const { app, db, calls } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'de',
        account_type: 'member',
        disabled_at: null
      }]
    }
  })

  const result = await app.service('password-reset').create({
    email: 'member@example.com'
  }, {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.30' }
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(db.tables.password_resets.length, 1)
  assert.equal(db.tables.password_resets[0].token_hash, hashPasswordResetToken('reset-token-1'))
  assert.equal(db.tables.password_resets[0].expires_at, '2026-05-11T13:00:00.000Z')
  assert.deepEqual(calls.sentEmails, [{
    email: 'member@example.com',
    token: 'reset-token-1',
    locale: 'de'
  }])
})

test('password-reset.create stays generic and does not store resets for unknown, guest, or disabled users', async () => {
  const { app, db, calls } = createHarness({
    seed: {
      users: [
        {
          id: 'guest-1',
          email: 'guest@example.com',
          preferred_locale: 'en',
          account_type: 'guest',
          disabled_at: null
        },
        {
          id: 'disabled-1',
          email: 'disabled@example.com',
          preferred_locale: 'en',
          account_type: 'member',
          disabled_at: '2026-05-10T10:00:00.000Z'
        }
      ]
    }
  })

  const unknown = await app.service('password-reset').create({ email: 'missing@example.com' }, { provider: 'rest' })
  const guest = await app.service('password-reset').create({ email: 'guest@example.com' }, { provider: 'rest' })
  const disabled = await app.service('password-reset').create({ email: 'disabled@example.com' }, { provider: 'rest' })

  assert.deepEqual(unknown, { ok: true })
  assert.deepEqual(guest, { ok: true })
  assert.deepEqual(disabled, { ok: true })
  assert.equal(db.tables.password_resets.length, 0)
  assert.equal(calls.sentEmails.length, 0)
})

test('password-reset does not expose or consume a token for a pending registration', async () => {
  const { app, calls } = createHarness({
    seed: {
      users: [{
        id: 'pending-user',
        email: 'pending@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null,
        registration_status: 'pending_admin_approval'
      }],
      password_resets: [{
        id: 'reset-pending',
        user_id: 'pending-user',
        token_hash: hashPasswordResetToken('pending-reset-token'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  await assert.rejects(
    app.service('password-reset').find({
      provider: 'rest',
      query: { token: 'pending-reset-token' }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.invalid_token')
      return true
    }
  )

  await assert.rejects(
    app.service('password-reset').patch('pending-reset-token', {
      password: 'NewPassw0rd!'
    }, {
      provider: 'rest'
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.invalid_token')
      return true
    }
  )
  assert.deepEqual(calls.userPatches, [])
})

test('password-reset validates the password policy before consuming a usable token', async () => {
  const { app, calls, db } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [{
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hashPasswordResetToken('reset-token-1'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  await assert.rejects(
    app.service('password-reset').patch('reset-token-1', {
      password: 'abcdefgh'
    }, {
      provider: 'rest'
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_policy.requirements_not_met')
      return true
    }
  )

  assert.equal(db.tables.password_resets[0].used_at, null)
  assert.deepEqual(calls.userPatches, [])
})

test('password-reset.create removes a fresh token again when email delivery is unavailable', async () => {
  const { app, db } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }]
    },
    sendResetEmail: async () => ({ ok: false, errorCode: 'api.smtp.not_configured' })
  })

  const result = await app.service('password-reset').create({
    email: 'member@example.com'
  }, {
    provider: 'rest'
  })

  assert.deepEqual(result, { ok: true })
  assert.equal(db.tables.password_resets.length, 0)
})

test('password-reset.find validates active tokens and distinguishes expired or already-used ones', async () => {
  const { app } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [{
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hashPasswordResetToken('reset-token-1'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  const result = await app.service('password-reset').find({
    provider: 'rest',
    query: { token: 'reset-token-1' }
  })
  assert.equal(result.ok, true)

  await assert.rejects(
    app.service('password-reset').find({
      provider: 'rest',
      query: { token: 'missing' }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.invalid_token')
      return true
    }
  )

  const expiredHarness = createHarness({
    now: '2026-05-11T14:00:00.000Z',
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [{
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hashPasswordResetToken('reset-token-1'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  await assert.rejects(
    expiredHarness.app.service('password-reset').find({
      provider: 'rest',
      query: { token: 'reset-token-1' }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.expired')
      return true
    }
  )

  const usedHarness = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [{
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hashPasswordResetToken('reset-token-1'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: '2026-05-11T12:10:00.000Z',
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:10:00.000Z'
      }]
    }
  })

  await assert.rejects(
    usedHarness.app.service('password-reset').find({
      provider: 'rest',
      query: { token: 'reset-token-1' }
    }),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.already_used')
      return true
    }
  )
})

test('password-reset.patch consumes open tokens, updates the password, and revokes refresh sessions', async () => {
  const { app, db, calls } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [
        {
          id: 'reset-1',
          user_id: 'user-1',
          token_hash: hashPasswordResetToken('reset-token-1'),
          expires_at: '2026-05-11T13:00:00.000Z',
          used_at: null,
          created_at: '2026-05-11T12:00:00.000Z',
          updated_at: '2026-05-11T12:00:00.000Z'
        },
        {
          id: 'reset-2',
          user_id: 'user-1',
          token_hash: hashPasswordResetToken('older-token'),
          expires_at: '2026-05-11T12:30:00.000Z',
          used_at: null,
          created_at: '2026-05-11T11:30:00.000Z',
          updated_at: '2026-05-11T11:30:00.000Z'
        }
      ],
      auth_sessions: [{
        id: 'session-1',
        user_id: 'user-1',
        refresh_token_hash: 'hash',
        transport: 'cookie',
        is_persistent: false,
        expires_at: '2026-05-12T12:00:00.000Z',
        last_used_at: null,
        revoked_at: null,
        created_ip: null,
        last_used_ip: null,
        user_agent: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  const result = await app.service('password-reset').patch('reset-token-1', {
    password: 'NewPassw0rd!'
  }, {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.31' }
  })

  assert.deepEqual(result, { ok: true })
  assert.deepEqual(calls.userPatches, [{
    id: 'user-1',
    data: {
      password: 'NewPassw0rd!'
    }
  }])
  assert.deepEqual(calls.revokedUserIds, ['user-1'])
  assert.equal(db.tables.password_resets.every((entry) => entry.used_at === '2026-05-11T12:00:00.000Z'), true)
  assert.equal(db.tables.auth_sessions[0].revoked_at, '2026-05-11T12:00:00.000Z')
})

test('password-reset public routes are rate-limited for repeated request and token attempts', async () => {
  const { app } = createHarness({
    seed: {
      users: [{
        id: 'user-1',
        email: 'member@example.com',
        preferred_locale: 'en',
        account_type: 'member',
        disabled_at: null
      }],
      password_resets: [{
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hashPasswordResetToken('reset-token-1'),
        expires_at: '2026-05-11T13:00:00.000Z',
        used_at: null,
        created_at: '2026-05-11T12:00:00.000Z',
        updated_at: '2026-05-11T12:00:00.000Z'
      }]
    }
  })

  const requestParams = {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.40' }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await app.service('password-reset').create({ email: 'member@example.com' }, requestParams)
  }

  await assert.rejects(
    app.service('password-reset').create({ email: 'member@example.com' }, requestParams),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.rate_limited')
      return true
    }
  )

  const tokenParams = {
    provider: 'rest',
    headers: { 'x-forwarded-for': '203.0.113.41' },
    query: { token: 'reset-token-1' }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await app.service('password-reset').find(tokenParams)
  }

  await assert.rejects(
    app.service('password-reset').find(tokenParams),
    (error) => {
      assert.equal(error.error_code, 'api.password_reset.rate_limited')
      return true
    }
  )
})
