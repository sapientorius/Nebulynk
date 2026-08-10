import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import { decryptSecret } from '../src/lib/ai-secrets.js'
import { sendTestEmail } from '../src/email.js'
import { smtpSettings } from '../src/services/smtp-settings/smtp-settings.js'
import { createMemoryDb } from './helpers/memory-db.js'

function withEnv(patch, run) {
  const previous = {}
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key]
    if (patch[key] === undefined || patch[key] === null) {
      delete process.env[key]
    } else {
      process.env[key] = String(patch[key])
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

function createHarness({ seed = {}, transportFactory } = {}) {
  const db = createMemoryDb({
    smtp_settings: [{
      id: 'default',
      enabled: false,
      host: null,
      port: null,
      secure: false,
      ignore_tls: false,
      user: null,
      from_email: null,
      from_name: null,
      created_at: '2026-05-08T09:00:00.000Z',
      updated_at: '2026-05-08T09:00:00.000Z'
    }],
    platform_settings: [
      { key: 'platform_name', value: 'Nebulynk' },
      { key: 'default_locale', value: 'en' }
    ],
    ...seed
  })

  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', db)
  app.set('authentication', { secret: 'test-auth-secret' })
  if (transportFactory) {
    app.set('smtpTransportFactory', transportFactory)
  }
  smtpSettings(app)

  return { app, db }
}

function adminParams(overrides = {}) {
  return {
    provider: 'rest',
    authenticated: true,
    user: { id: 'admin-1', email: 'admin@example.test', is_admin: true },
    resolvedPermissions: new Set(['*']),
    ...overrides
  }
}

test('smtp-settings hook-chain: non-admin reads are forbidden', async () => {
  const { app } = createHarness()

  await assert.rejects(
    app.service('smtp-settings').find({
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )
})

test('smtp-settings patch stores encrypted password and exposes sanitized admin config', async () => {
  const { app, db } = createHarness()

  const result = await app.service('smtp-settings').patch(null, {
    enabled: true,
    host: 'smtp.admin.test',
    port: 465,
    secure: true,
    ignore_tls: false,
    user: 'mailer',
    password: 'super-secret',
    from_email: 'noreply@admin.test',
    from_name: 'Nebulynk Mailer'
  }, adminParams())

  assert.equal(db.tables.smtp_secrets.length, 1)
  assert.equal(
    decryptSecret(app, db.tables.smtp_secrets[0].encrypted_password),
    'super-secret'
  )
  assert.deepEqual(result, {
    enabled: true,
    host: 'smtp.admin.test',
    port: 465,
    secure: true,
    ignore_tls: false,
    user: 'mailer',
    from_email: 'noreply@admin.test',
    from_name: 'Nebulynk Mailer',
    has_password: true,
    configured: true,
    effective_source: 'admin'
  })
})

test('smtp-settings uses env fallback until admin settings are saved', async () => {
  const { app } = createHarness()

  await withEnv({
    SMTP_HOST: 'smtp.env.test',
    SMTP_PORT: '587',
    SMTP_USER: 'env-user',
    SMTP_PASS: 'env-pass',
    SMTP_FROM: 'noreply@env.test'
  }, async () => {
    const result = await app.service('smtp-settings').find(adminParams())

    assert.equal(result.configured, true)
    assert.equal(result.effective_source, 'env')
  })
})

test('smtp-settings blocks env fallback for an incomplete admin draft', async () => {
  const { app } = createHarness()

  await withEnv({
    SMTP_HOST: 'smtp.env.test',
    SMTP_PORT: '587',
    SMTP_USER: 'env-user',
    SMTP_PASS: 'env-pass',
    SMTP_FROM: 'noreply@env.test'
  }, async () => {
    await app.service('smtp-settings').patch(null, {
      enabled: true,
      host: 'smtp.admin.test',
      port: 2525,
      secure: false,
      ignore_tls: true,
      user: 'admin-user',
      from_email: 'noreply@admin.test'
    }, adminParams())

    const result = await app.service('smtp-settings').find(adminParams())

    assert.deepEqual(result, {
      enabled: true,
      host: 'smtp.admin.test',
      port: 2525,
      secure: false,
      ignore_tls: true,
      user: 'admin-user',
      from_email: 'noreply@admin.test',
      from_name: '',
      has_password: false,
      configured: false,
      effective_source: null
    })
  })
})

test('smtp-settings blocks env fallback when an admin disables SMTP', async () => {
  const { app } = createHarness()

  await withEnv({
    SMTP_HOST: 'smtp.env.test',
    SMTP_PORT: '587',
    SMTP_USER: 'env-user',
    SMTP_PASS: 'env-pass',
    SMTP_FROM: 'noreply@env.test'
  }, async () => {
    await app.service('smtp-settings').patch(null, {
      enabled: true,
      host: 'smtp.admin.test',
      port: 587,
      secure: false,
      ignore_tls: false,
      user: 'admin-user',
      password: 'admin-pass',
      from_email: 'noreply@admin.test'
    }, adminParams())
    await app.service('smtp-settings').patch(null, { enabled: false }, adminParams())

    const result = await app.service('smtp-settings').find(adminParams())

    assert.equal(result.configured, false)
    assert.equal(result.effective_source, null)
  })
})

test('smtp-settings create supports connection test and test mail with current admin email fallback', async () => {
  let verifyCalls = 0
  let sentTo = null
  const { app } = createHarness({
    transportFactory: () => ({
      async verify() {
        verifyCalls += 1
      },
      async sendMail(payload) {
        sentTo = payload.to
        return { accepted: [payload.to], rejected: [] }
      }
    })
  })

  await app.service('smtp-settings').patch(null, {
    enabled: true,
    host: 'smtp.admin.test',
    port: 587,
    secure: false,
    ignore_tls: false,
    user: 'mailer',
    password: 'super-secret',
    from_email: 'noreply@admin.test',
    from_name: 'Mailer'
  }, adminParams())

  const connectionResult = await app.service('smtp-settings').create({
    action: 'test_connection'
  }, adminParams())
  const sendResult = await app.service('smtp-settings').create({
    action: 'send_test_email'
  }, adminParams())

  assert.equal(verifyCalls, 1)
  assert.equal(sentTo, 'admin@example.test')
  assert.equal(connectionResult.ok, true)
  assert.equal(sendResult.ok, true)
  assert.equal(sendResult.source, 'admin')
})

test('smtp-settings patch invalidates the cached transporter so later sends use the new config', async () => {
  const transportConfigs = []
  const { app } = createHarness({
    transportFactory: (config) => {
      transportConfigs.push(config)
      return {
        async sendMail(payload) {
          return { accepted: [payload.to], rejected: [] }
        }
      }
    }
  })

  await app.service('smtp-settings').patch(null, {
    enabled: true,
    host: 'smtp.one.test',
    port: 587,
    secure: false,
    ignore_tls: false,
    user: 'mailer',
    password: 'secret-one',
    from_email: 'noreply@one.test'
  }, adminParams())

  await sendTestEmail(app, { to: 'one@example.test' })
  await sendTestEmail(app, { to: 'two@example.test' })

  await app.service('smtp-settings').patch(null, {
    host: 'smtp.two.test'
  }, adminParams())

  await sendTestEmail(app, { to: 'three@example.test' })

  assert.equal(transportConfigs.length, 2)
  assert.equal(transportConfigs[0].host, 'smtp.one.test')
  assert.equal(transportConfigs[1].host, 'smtp.two.test')
})
