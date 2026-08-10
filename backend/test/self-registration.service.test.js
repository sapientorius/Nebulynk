import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { selfRegistration } from '../src/services/self-registration/self-registration.js'
import { PendingRegistrationsService } from '../src/services/pending-registrations/pending-registrations.js'
import { hashRegistrationToken } from '../src/lib/self-registration.js'
import { getPendingRegistrationAlertCount } from '../src/lib/registration-pending-alerts.js'
import { createMemoryDb } from './helpers/memory-db.js'
import { createRateLimiter, MemoryRateLimitStore } from '../src/lib/rate-limit.js'

const DEFAULT_NOW = '2026-08-09T12:00:00.000Z'

function createRegistrationHarness({
  enabled = true,
  allowedDomains = [],
  requiresAdminApproval = false,
  smtpConfigured = true,
  confirmationEmailResult = { ok: true },
  passwordStrengthLevel = 'basic',
  seed = {}
} = {}) {
  let now = DEFAULT_NOW
  const db = createMemoryDb({
    platform_settings: [
      { key: 'initialized', value: 'true' },
      { key: 'default_locale', value: 'en' },
      { key: 'self_registration_enabled', value: enabled ? 'true' : 'false' },
      { key: 'self_registration_allowed_domains', value: JSON.stringify(allowedDomains) },
      { key: 'self_registration_requires_admin_approval', value: requiresAdminApproval ? 'true' : 'false' },
      { key: 'password_strength_level', value: passwordStrengthLevel }
    ],
    roles: [{ id: 'role-member', name: 'platform:member' }],
    users: [],
    user_roles: [],
    registration_email_tokens: [],
    ...seed
  })
  const calls = {
    confirmationEmails: []
  }
  const app = feathers()
  app.set('postgresqlClient', db)
  app.set('rateLimiter', createRateLimiter(new MemoryRateLimitStore({
    now: () => new Date(now).getTime()
  }), {
    now: () => new Date(now).getTime()
  }))

  let createdUserCount = db.tables.users.length
  app.use('users', {
    async create(data) {
      createdUserCount += 1
      const user = {
        id: `registration-user-${createdUserCount}`,
        account_type: 'member',
        created_at: now,
        updated_at: now,
        ...data
      }
      db.tables.users.push(user)
      return { ...user }
    }
  })

  selfRegistration(app, {
    now: () => new Date(now),
    createToken: () => 'registration-confirmation-token',
    hashToken: hashRegistrationToken,
    getEmailDelivery: async () => ({
      configured: smtpConfigured,
      source: smtpConfigured ? 'admin' : null
    }),
    sendConfirmationEmail: async (_serviceApp, payload) => {
      calls.confirmationEmails.push(payload)
      return confirmationEmailResult
    }
  })

  return {
    app,
    calls,
    db,
    setNow(value) {
      now = value
    }
  }
}

function registrationPayload(overrides = {}) {
  return {
    display_name: 'New Member',
    email: 'new.member@example.com',
    password: 'NewMember1!',
    ...overrides
  }
}

function registrationManager(overrides = {}) {
  return {
    id: 'registration-manager',
    email: 'manager@example.com',
    display_name: 'Registration Manager',
    preferred_locale: 'en',
    account_type: 'member',
    is_admin: true,
    registration_status: 'active',
    disabled_at: null,
    ...overrides
  }
}

function publicParams(ip = '203.0.113.90') {
  return {
    provider: 'rest',
    headers: { 'x-forwarded-for': ip }
  }
}

test('self-registration exposes its enabled state and configured password policy', async () => {
  const { app } = createRegistrationHarness({
    enabled: false,
    passwordStrengthLevel: 'very_strong'
  })

  const config = await app.service('self-registration').find(publicParams())

  assert.deepEqual(config, {
    enabled: false,
    password_policy: {
      level: 'very_strong',
      min_length: 10,
      min_types: 3
    }
  })

  await assert.rejects(
    app.service('self-registration').create(registrationPayload(), publicParams()),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.disabled')
      return true
    }
  )
})

test('self-registration normalizes and enforces the configured exact email domains', async () => {
  const { app, db } = createRegistrationHarness({
    allowedDomains: ['Example.COM.']
  })

  await assert.rejects(
    app.service('self-registration').create(registrationPayload({
      email: 'member@sub.example.com'
    }), publicParams()),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.domain_not_allowed')
      return true
    }
  )

  const result = await app.service('self-registration').create(registrationPayload({
    email: 'Member@EXAMPLE.com'
  }), publicParams())

  assert.equal(result.confirmation_delivery, 'email')
  assert.equal(db.tables.users[0].email, 'member@example.com')
})

test('self-registration keeps registrations manually confirmable when SMTP is unavailable', async () => {
  const { app, calls, db } = createRegistrationHarness({
    smtpConfigured: false,
    seed: { users: [registrationManager()] }
  })

  const result = await app.service('self-registration').create(registrationPayload(), publicParams())

  assert.deepEqual(result, {
    ok: true,
    registration_status: 'pending_email_verification',
    confirmation_delivery: 'manual'
  })
  const registration = db.tables.users.find((user) => user.email === 'new.member@example.com')
  assert.equal(registration.registration_status, 'pending_email_verification')
  assert.equal(registration.registration_pending_reason, 'smtp_unavailable')
  assert.equal(db.tables.registration_email_tokens.length, 0)
  assert.deepEqual(calls.confirmationEmails, [])
  assert.deepEqual(db.tables.notifications.map((notification) => ({
    user_id: notification.user_id,
    type: notification.type,
    actor_id: notification.actor_id
  })), [{
    user_id: 'registration-manager',
    type: 'registration_pending',
    actor_id: registration.id
  }])
})

test('self-registration confirms an email once, activates the account, and assigns the member role', async () => {
  const { app, calls, db } = createRegistrationHarness()

  const created = await app.service('self-registration').create(registrationPayload(), publicParams())
  assert.equal(created.confirmation_delivery, 'email')
  assert.equal(db.tables.registration_email_tokens.length, 1)
  assert.equal(db.tables.registration_email_tokens[0].token_hash, hashRegistrationToken('registration-confirmation-token'))
  assert.equal(db.tables.registration_email_tokens[0].token_hash.includes('registration-confirmation-token'), false)
  assert.deepEqual(calls.confirmationEmails, [{
    email: 'new.member@example.com',
    token: 'registration-confirmation-token',
    locale: 'en'
  }])

  const confirmation = await app.service('self-registration').patch(
    'registration-confirmation-token',
    {},
    publicParams()
  )

  assert.deepEqual(confirmation, {
    ok: true,
    registration_status: 'active',
    activated: true
  })
  assert.equal(db.tables.users[0].registration_status, 'active')
  assert.equal(db.tables.users[0].is_verified, true)
  assert.equal(db.tables.registration_email_tokens[0].consumed_at, DEFAULT_NOW)
  assert.deepEqual(db.tables.user_roles.map(({ user_id: userId, role_id: roleId }) => ({ userId, roleId })), [{
    userId: 'registration-user-1',
    roleId: 'role-member'
  }])

  await assert.rejects(
    app.service('self-registration').patch('registration-confirmation-token', {}, publicParams()),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.token_already_used')
      return true
    }
  )
})

test('self-registration transitions email-confirmed accounts to admin approval when required', async () => {
  const { app, db } = createRegistrationHarness({
    requiresAdminApproval: true,
    seed: { users: [registrationManager()] }
  })

  await app.service('self-registration').create(registrationPayload(), publicParams())
  const confirmation = await app.service('self-registration').patch(
    'registration-confirmation-token',
    {},
    publicParams()
  )

  assert.deepEqual(confirmation, {
    ok: true,
    registration_status: 'pending_admin_approval',
    activated: false
  })
  const registration = db.tables.users.find((user) => user.email === 'new.member@example.com')
  assert.equal(registration.is_verified, true)
  assert.equal(registration.registration_status, 'pending_admin_approval')
  assert.equal(registration.registration_pending_reason, 'email_confirmed_admin_approval')
  assert.equal(db.tables.user_roles.length, 0)
  assert.equal(db.tables.notifications.length, 1)
  assert.equal(db.tables.notifications[0].user_id, 'registration-manager')
  assert.equal(db.tables.notifications[0].type, 'registration_pending')
})

test('self-registration leaves SMTP delivery failures unclassified and unannounced', async () => {
  const { app, db } = createRegistrationHarness({
    confirmationEmailResult: { ok: false, errorCode: 'api.smtp.delivery_failed' },
    seed: { users: [registrationManager()] }
  })

  const result = await app.service('self-registration').create(registrationPayload(), publicParams())
  const registration = db.tables.users.find((user) => user.email === 'new.member@example.com')

  assert.equal(result.confirmation_delivery, 'manual')
  assert.equal(registration.registration_pending_reason, null)
  assert.equal(db.tables.registration_email_tokens.length, 0)
  assert.equal(db.tables.notifications.length, 0)
})

test('self-registration rejects expired confirmation tokens and rate-limits public attempts', async () => {
  const { app, setNow } = createRegistrationHarness()

  await app.service('self-registration').create(registrationPayload(), publicParams())
  setNow('2026-08-10T12:00:00.000Z')
  await assert.rejects(
    app.service('self-registration').patch('registration-confirmation-token', {}, publicParams()),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.token_expired')
      return true
    }
  )

  const limitedHarness = createRegistrationHarness({ enabled: false })
  const params = publicParams('203.0.113.91')
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(limitedHarness.app.service('self-registration').create(registrationPayload(), params))
  }
  await assert.rejects(
    limitedHarness.app.service('self-registration').create(registrationPayload(), params),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.rate_limited')
      return true
    }
  )
})

test('pending registrations can be manually activated or deleted by an administrator', async () => {
  const db = createMemoryDb({
    platform_settings: [{ key: 'default_locale', value: 'en' }],
    roles: [{ id: 'role-member', name: 'platform:member' }],
    users: [
      {
        id: 'pending-email',
        email: 'pending@example.com',
        display_name: 'Pending Email',
        preferred_locale: 'de',
        is_verified: false,
        registration_status: 'pending_email_verification',
        registration_pending_reason: 'smtp_unavailable',
        created_at: DEFAULT_NOW,
        updated_at: DEFAULT_NOW
      },
      {
        id: 'pending-approval',
        email: 'approval@example.com',
        display_name: 'Pending Approval',
        preferred_locale: 'en',
        is_verified: true,
        registration_status: 'pending_admin_approval',
        registration_pending_reason: 'email_confirmed_admin_approval',
        created_at: DEFAULT_NOW,
        updated_at: DEFAULT_NOW
      }
    ],
    registration_email_tokens: [{
      id: 'registration-token-1',
      user_id: 'pending-email',
      token_hash: hashRegistrationToken('manual-token'),
      expires_at: '2026-08-10T12:00:00.000Z',
      consumed_at: null,
      created_at: DEFAULT_NOW,
      updated_at: DEFAULT_NOW
    }]
  })
  const sentActivationEmails = []
  const app = {
    get(key) {
      assert.equal(key, 'postgresqlClient')
      return db
    }
  }
  const service = new PendingRegistrationsService(app, {
    now: () => new Date(DEFAULT_NOW),
    sendActivationEmail: async (_serviceApp, payload) => {
      sentActivationEmails.push(payload)
      return { ok: false, errorCode: 'api.smtp.not_configured' }
    }
  })

  const open = await service.find()
  assert.deepEqual(open.map((entry) => entry.id), ['pending-email', 'pending-approval'])
  assert.equal(await getPendingRegistrationAlertCount(db), 2)

  const result = await service.patch('pending-email', { action: 'confirm' })
  assert.equal(result.ok, true)
  assert.equal(result.email_sent, false)
  assert.equal(db.tables.users.find((user) => user.id === 'pending-email').registration_status, 'active')
  assert.equal(db.tables.users.find((user) => user.id === 'pending-email').registration_pending_reason, null)
  assert.equal(db.tables.registration_email_tokens[0].consumed_at, DEFAULT_NOW)
  assert.deepEqual(sentActivationEmails, [{
    email: 'pending@example.com',
    locale: 'de'
  }])
  assert.equal(db.tables.user_roles.some((entry) => (
    entry.user_id === 'pending-email' && entry.role_id === 'role-member'
  )), true)
  assert.equal(await getPendingRegistrationAlertCount(db), 1)

  const removed = await service.remove('pending-approval')
  assert.equal(removed.id, 'pending-approval')
  assert.equal(db.tables.users.some((user) => user.id === 'pending-approval'), false)
  assert.equal(await getPendingRegistrationAlertCount(db), 0)

  db.tables.users.push({
    id: 'pending-email-error',
    email: 'error@example.com',
    display_name: 'Email Error',
    preferred_locale: 'en',
    is_verified: true,
    registration_status: 'pending_admin_approval',
    created_at: DEFAULT_NOW,
    updated_at: DEFAULT_NOW
  })
  const throwingService = new PendingRegistrationsService(app, {
    now: () => new Date(DEFAULT_NOW),
    sendActivationEmail: async () => {
      throw new Error('SMTP connection failed')
    }
  })
  const emailFailure = await throwingService.patch('pending-email-error', { action: 'confirm' })

  assert.equal(emailFailure.email_sent, false)
  assert.equal(emailFailure.email_error_code, 'api.smtp.delivery_failed')
  assert.equal(db.tables.users.find((user) => user.id === 'pending-email-error').registration_status, 'active')
})
