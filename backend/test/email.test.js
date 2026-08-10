import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendInviteEmailStatus
} from '../src/services/invites/invites.js'
import {
  getEmailDeliveryStatus,
  parseSmtpBoolean,
  resolveEnvSmtpConfig,
  sendAccountActivatedEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendRegistrationConfirmationEmail,
  sendPlatformSecurityUpdateEmail
} from '../src/email.js'
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

function createApp({
  seed = {},
  transportFactory
} = {}) {
  const db = createMemoryDb({
    platform_settings: [
      { key: 'platform_name', value: 'Nebulynk' },
      { key: 'default_locale', value: 'en' }
    ],
    ...seed
  })

  const state = {
    postgresqlClient: db,
    authentication: { secret: 'test-auth-secret' },
    smtpTransportFactory: transportFactory
  }

  return {
    db,
    app: {
      get(key) {
        return state[key]
      },
      set(key, value) {
        state[key] = value
      }
    }
  }
}

test('email helpers parse SMTP booleans and compatibility aliases', () => {
  assert.equal(parseSmtpBoolean('true'), true)
  assert.equal(parseSmtpBoolean('no'), false)
  assert.equal(parseSmtpBoolean('maybe'), null)

  const aliasConfig = resolveEnvSmtpConfig({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test',
    EMAIL_SMTP_SECURE: 'true',
    EMAIL_SMTP_IGNORE_TLS: 'false'
  })

  assert.equal(aliasConfig.secure, true)
  assert.equal(aliasConfig.ignore_tls, false)

  const inferredSecure = resolveEnvSmtpConfig({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '465',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test'
  })

  assert.equal(inferredSecure.secure, true)
})

test('admin-managed disabled SMTP blocks env fallback for all delivery helpers', async () => {
  let sendMailCalls = 0
  const { app } = createApp({
    seed: {
      smtp_settings: [{
        id: 'default',
        admin_managed: true,
        enabled: false,
        host: 'smtp.admin.test',
        port: 587,
        secure: false,
        ignore_tls: false,
        user: 'admin-user',
        from_email: 'noreply@admin.test',
        from_name: null
      }]
    },
    transportFactory: () => ({
      async sendMail() {
        sendMailCalls += 1
        return { accepted: ['recipient@example.test'], rejected: [] }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.env.test',
    SMTP_PORT: '587',
    SMTP_USER: 'env-user',
    SMTP_PASS: 'env-pass',
    SMTP_FROM: 'noreply@env.test'
  }, async () => {
    assert.deepEqual(await getEmailDeliveryStatus(app), {
      configured: false,
      source: null
    })

    const results = await Promise.all([
      sendInviteEmail(app, {
        email: 'invitee@example.test',
        token: 'invite-token',
        inviterName: 'Admin',
        platformName: 'Nebulynk',
        message: null,
        locale: 'en'
      }),
      sendPasswordResetEmail(app, {
        email: 'user@example.test',
        token: 'reset-token',
        locale: 'en'
      }),
      sendRegistrationConfirmationEmail(app, {
        email: 'registrant@example.test',
        token: 'registration-token',
        locale: 'en'
      }),
      sendAccountActivatedEmail(app, {
        email: 'activated@example.test',
        locale: 'en'
      })
    ])

    for (const result of results) {
      assert.equal(result.ok, false)
      assert.equal(result.errorCode, 'api.smtp.not_configured')
    }
    assert.equal(sendMailCalls, 0)
  })
})

test('sendInviteEmail reports failure when SMTP accepts no recipients', async () => {
  const { app } = createApp({
    transportFactory: () => ({
      async sendMail(payload) {
        return {
          accepted: [],
          rejected: [payload.to]
        }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test'
  }, async () => {
    const result = await sendInviteEmail(app, {
      email: 'invitee@example.test',
      token: 'token-1',
      inviterName: 'Admin',
      platformName: 'Nebulynk',
      message: null,
      locale: 'en'
    })

    assert.equal(result.ok, false)
    assert.equal(result.configured, true)
    assert.equal(result.source, 'env')
    assert.equal(result.errorCode, 'api.smtp.no_accepted_recipients')
  })
})

test('sendInviteEmail surfaces provider delivery errors with a stable application code prefix', async () => {
  const { app } = createApp({
    transportFactory: () => ({
      async sendMail() {
        const error = new Error('Connection timed out')
        error.code = 'ETIMEDOUT'
        throw error
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test'
  }, async () => {
    const result = await sendInviteEmail(app, {
      email: 'invitee@example.test',
      token: 'token-1',
      inviterName: 'Admin',
      platformName: 'Nebulynk',
      message: null,
      locale: 'en'
    })

    assert.equal(result.ok, false)
    assert.equal(result.errorCode, 'api.smtp.etimedout')
    assert.equal(result.errorMessage, 'Connection timed out')
  })
})

test('security update email bundles releases, localizes content, and uses the highest severity', async () => {
  let delivered
  const { app } = createApp({
    seed: {
      platform_settings: [
        { key: 'platform_name', value: 'Nebulynk Test' },
        { key: 'default_locale', value: 'en' }
      ]
    },
    transportFactory: () => ({
      async sendMail(payload) {
        delivered = payload
        return { accepted: [payload.to], rejected: [] }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test',
    FRONTEND_URL: 'https://app.example.test'
  }, async () => {
    const result = await sendPlatformSecurityUpdateEmail(app, {
      user: { id: 'admin-1', email: 'admin@example.test', preferred_locale: 'de' },
      currentVersion: '0.2.0',
      latestVersion: '0.4.0',
      releases: [
        {
          version: '0.3.0',
          title: { de: 'Drittes Release', en: 'Third release' },
          security: [{ severity: 'low', summary: { de: 'Niedriger Hinweis', en: 'Low advisory' } }]
        },
        {
          version: '0.4.0',
          title: { de: 'Viertes Release', en: 'Fourth release' },
          security: [{ severity: 'critical', summary: { de: 'Kritischer Hinweis', en: 'Critical advisory' } }]
        }
      ]
    })

    assert.equal(result.ok, true)
    assert.equal(delivered.to, 'admin@example.test')
    assert.match(delivered.subject, /CRITICAL/)
    assert.match(delivered.html, /Drittes Release/)
    assert.match(delivered.html, /Viertes Release/)
    assert.match(delivered.html, /https:\/\/app\.example\.test\/admin\?tab=updates/)
  })
})

test('sendInviteEmail escapes dynamic HTML content', async () => {
  let sentHtml = ''
  const { app } = createApp({
    transportFactory: () => ({
      async sendMail(payload) {
        sentHtml = payload.html
        return {
          accepted: [payload.to],
          rejected: []
        }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test',
    FRONTEND_URL: 'https://chat.example.test'
  }, async () => {
    const result = await sendInviteEmail(app, {
      email: 'invitee@example.test',
      token: 'token-1',
      inviterName: 'Admin <script>alert(1)</script>',
      platformName: 'Nebulynk & Co',
      message: '<img src=x onerror=alert(1)> "hello"',
      locale: 'en'
    })

    assert.equal(result.ok, true)
    assert.equal(sentHtml.includes('<img src=x'), false)
    assert.equal(sentHtml.includes('<script>'), false)
    assert.match(sentHtml, /Admin &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(sentHtml, /Nebulynk &amp; Co/)
    assert.match(sentHtml, /&lt;img src=x onerror=alert\(1\)&gt; &quot;hello&quot;/)
  })
})

test('sendPasswordResetEmail escapes platform name and reset URL in HTML content', async () => {
  let sentHtml = ''
  const { app } = createApp({
    seed: {
      platform_settings: [
        { key: 'platform_name', value: 'Nebulynk <script>alert(1)</script>' },
        { key: 'default_locale', value: 'en' }
      ]
    },
    transportFactory: () => ({
      async sendMail(payload) {
        sentHtml = payload.html
        return {
          accepted: [payload.to],
          rejected: []
        }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test',
    FRONTEND_URL: 'https://chat.example.test/?tenant=one&mode=reset'
  }, async () => {
    const result = await sendPasswordResetEmail(app, {
      email: 'member@example.test',
      token: 'reset-token',
      locale: 'en'
    })

    assert.equal(result.ok, true)
    assert.equal(sentHtml.includes('<script>'), false)
    assert.match(sentHtml, /Nebulynk &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    assert.match(sentHtml, /tenant=one&amp;mode=reset/)
  })
})

test('appendInviteEmailStatus enriches invite results with delivery metadata', async () => {
  const { app } = createApp({
    transportFactory: () => ({
      async sendMail(payload) {
        return {
          accepted: [payload.to],
          rejected: []
        }
      }
    })
  })

  await withEnv({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: '587',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'noreply@example.test',
    FRONTEND_URL: 'https://chat.example.test'
  }, async () => {
    const context = {
      app,
      result: {
        email: 'invitee@example.test',
        message: 'Welcome'
      },
      params: {
        _inviteToken: 'invite-token-1',
        _inviterName: 'Admin'
      }
    }

    await appendInviteEmailStatus(context)

    assert.equal(context.result.email_sent, true)
    assert.equal(context.result.email_configured, true)
    assert.equal(context.result.email_error_code, null)
    assert.equal(context.result.email_error_message, null)
    assert.equal(context.result.email_delivery_source, 'env')
    assert.equal(context.result.invite_url, 'https://chat.example.test/invite/invite-token-1')
  })
})
