import nodemailer from 'nodemailer'
import { decryptSecret } from './lib/ai-secrets.js'
import { logger } from './logger.js'
import { bt } from './lib/i18n.js'
import { resolveFrontendUrl } from './lib/security-config.js'
import { buildPasswordResetUrl } from './lib/password-reset.js'
import { buildRegistrationConfirmationUrl } from './lib/self-registration.js'

export const DEFAULT_SMTP_SETTINGS_ID = 'default'
const DEFAULT_SMTP_PORT = 587
const DEFAULT_SMTP_FROM = 'noreply@nebulynk.local'
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

let transporterCache = {
  key: null,
  transporter: null,
  factory: null
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value)
  return normalized || null
}

function normalizePort(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null
  }
  return parsed
}

export function parseSmtpBoolean(value) {
  if (typeof value === 'boolean') return value

  const normalized = normalizeString(value).toLowerCase()
  if (!normalized) return null
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}

function resolveFirstBoolean(...values) {
  for (const value of values) {
    const parsed = parseSmtpBoolean(value)
    if (parsed !== null) return parsed
  }
  return null
}

function slugifyValue(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function formatFromAddress(config, platformName) {
  const displayName = normalizeString(config.from_name) || normalizeString(platformName) || 'Nebulynk'
  const fromEmail = normalizeString(config.from_email) || DEFAULT_SMTP_FROM
  return `"${displayName.replace(/"/g, '\\"')}" <${fromEmail}>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getTransportFactory(app) {
  return app?.get?.('smtpTransportFactory') || nodemailer.createTransport
}

function buildTransportKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ignore_tls: config.ignore_tls,
    user: config.user,
    password: config.password
  })
}

function closeTransporter(transporter) {
  if (transporter && typeof transporter.close === 'function') {
    try {
      transporter.close()
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export function invalidateSmtpTransporter() {
  closeTransporter(transporterCache.transporter)
  transporterCache = {
    key: null,
    transporter: null,
    factory: null
  }
}

export function resolveEnvSmtpConfig(env = process.env) {
  const host = normalizeNullableString(env.SMTP_HOST)
  const port = normalizePort(env.SMTP_PORT) || DEFAULT_SMTP_PORT
  const user = normalizeNullableString(env.SMTP_USER)
  const password = normalizeNullableString(env.SMTP_PASS)
  const secure = resolveFirstBoolean(env.SMTP_SECURE, env.EMAIL_SMTP_SECURE)
  const ignoreTls = resolveFirstBoolean(env.SMTP_IGNORE_TLS, env.EMAIL_SMTP_IGNORE_TLS)

  if (!host && !user && !password) {
    return null
  }

  return {
    enabled: true,
    host,
    port,
    secure: secure ?? port === 465,
    ignore_tls: ignoreTls ?? false,
    user,
    password,
    from_email: normalizeNullableString(env.SMTP_FROM) || DEFAULT_SMTP_FROM,
    from_name: normalizeNullableString(env.SMTP_FROM_NAME),
    source: 'env'
  }
}

export function isSmtpConfigComplete(config) {
  return !!(
    config?.enabled
    && normalizeString(config.host)
    && Number.isInteger(config.port)
    && normalizeString(config.user)
    && normalizeString(config.password)
    && normalizeString(config.from_email)
  )
}

function hasStoredSmtpDraft(config) {
  if (!config) return false
  return Boolean(
    config.enabled
    || normalizeString(config.host)
    || Number.isInteger(config.port)
    || config.secure
    || config.ignore_tls
    || normalizeString(config.user)
    || normalizeString(config.from_email)
    || normalizeString(config.from_name)
    || normalizeString(config.password)
  )
}

export async function getStoredSmtpConfig(app) {
  const db = app?.get?.('postgresqlClient')
  if (!db) return null

  const row = await db('smtp_settings').where('id', DEFAULT_SMTP_SETTINGS_ID).first()
  const secretRow = await db('smtp_secrets').where('smtp_settings_id', DEFAULT_SMTP_SETTINGS_ID).first()

  if (!row && !secretRow) {
    return null
  }

  return {
    enabled: row?.enabled === true,
    host: normalizeNullableString(row?.host),
    port: normalizePort(row?.port),
    secure: row?.secure === true,
    ignore_tls: row?.ignore_tls === true,
    user: normalizeNullableString(row?.user),
    password: secretRow?.encrypted_password ? decryptSecret(app, secretRow.encrypted_password) : null,
    from_email: normalizeNullableString(row?.from_email),
    from_name: normalizeNullableString(row?.from_name),
    source: 'admin'
  }
}

function sanitizeSmtpConfig(config, { configured = false, effectiveSource = null, hasPassword = false } = {}) {
  return {
    enabled: config?.enabled === true,
    host: normalizeString(config?.host),
    port: normalizePort(config?.port) || DEFAULT_SMTP_PORT,
    secure: config?.secure === true,
    ignore_tls: config?.ignore_tls === true,
    user: normalizeString(config?.user),
    from_email: normalizeString(config?.from_email),
    from_name: normalizeString(config?.from_name),
    has_password: hasPassword,
    configured,
    effective_source: effectiveSource
  }
}

export async function resolveEffectiveSmtpConfig(app) {
  const stored = await getStoredSmtpConfig(app)
  if (stored?.enabled && isSmtpConfigComplete(stored)) {
    return stored
  }

  const envConfig = resolveEnvSmtpConfig()
  if (envConfig && isSmtpConfigComplete(envConfig)) {
    return envConfig
  }

  return null
}

export async function getEmailDeliveryStatus(app) {
  const effectiveConfig = await resolveEffectiveSmtpConfig(app)
  return {
    configured: !!effectiveConfig,
    source: effectiveConfig?.source || null
  }
}

export async function buildSmtpSettingsResponse(app) {
  const storedConfig = await getStoredSmtpConfig(app)
  const envConfig = resolveEnvSmtpConfig()
  const effectiveConfig = await resolveEffectiveSmtpConfig(app)

  if (storedConfig && hasStoredSmtpDraft(storedConfig)) {
    return sanitizeSmtpConfig(storedConfig, {
      configured: !!effectiveConfig,
      effectiveSource: effectiveConfig?.source || null,
      hasPassword: Boolean(storedConfig.password)
    })
  }

  if (envConfig) {
    return sanitizeSmtpConfig(envConfig, {
      configured: isSmtpConfigComplete(envConfig),
      effectiveSource: effectiveConfig?.source || null,
      hasPassword: Boolean(envConfig.password)
    })
  }

  return sanitizeSmtpConfig(null, {
    configured: false,
    effectiveSource: null,
    hasPassword: false
  })
}

export function normalizeStoredSmtpPatch(data = {}) {
  const patch = {}

  if (Object.prototype.hasOwnProperty.call(data, 'enabled')) {
    patch.enabled = data.enabled === true
  }
  if (Object.prototype.hasOwnProperty.call(data, 'host')) {
    patch.host = normalizeNullableString(data.host)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'port')) {
    patch.port = normalizePort(data.port)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'secure')) {
    patch.secure = data.secure === true
  }
  if (Object.prototype.hasOwnProperty.call(data, 'ignore_tls')) {
    patch.ignore_tls = data.ignore_tls === true
  }
  if (Object.prototype.hasOwnProperty.call(data, 'user')) {
    patch.user = normalizeNullableString(data.user)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'password')) {
    patch.password = normalizeNullableString(data.password)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'from_email')) {
    patch.from_email = normalizeNullableString(data.from_email)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'from_name')) {
    patch.from_name = normalizeNullableString(data.from_name)
  }

  return patch
}

async function getTransporter(app, config) {
  if (!config) return null

  const cacheKey = buildTransportKey(config)
  const transportFactory = getTransportFactory(app)
  if (
    transporterCache.key === cacheKey
    && transporterCache.factory === transportFactory
    && transporterCache.transporter
  ) {
    return transporterCache.transporter
  }

  closeTransporter(transporterCache.transporter)
  transporterCache = {
    key: cacheKey,
    transporter: transportFactory({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ignoreTLS: config.ignore_tls,
      auth: {
        user: config.user,
        pass: config.password
      }
    }),
    factory: transportFactory
  }
  return transporterCache.transporter
}

function buildLogContext(config, extra = {}) {
  return {
    smtp_source: config?.source || null,
    smtp_host: config?.host || null,
    smtp_port: config?.port || null,
    smtp_secure: config?.secure === true,
    smtp_ignore_tls: config?.ignore_tls === true,
    smtp_user: config?.user || null,
    ...extra
  }
}

function buildFailureResult(code, message, config, extra = {}) {
  return {
    ok: false,
    configured: !!config,
    source: config?.source || null,
    errorCode: code,
    errorMessage: message,
    ...extra
  }
}

function buildSuccessResult(config, extra = {}) {
  return {
    ok: true,
    configured: true,
    source: config?.source || null,
    errorCode: null,
    errorMessage: null,
    ...extra
  }
}

function hasAcceptedRecipients(info) {
  return Array.isArray(info?.accepted) && info.accepted.length > 0
}

function normalizeProviderErrorMessage(error) {
  return normalizeString(error?.message) || 'SMTP request failed'
}

export async function testSmtpConnection(app) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('SMTP connection test skipped because SMTP is not configured')
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  try {
    const transport = await getTransporter(app, config)
    await transport.verify()
    logger.info('SMTP connection test succeeded', buildLogContext(config))
    return buildSuccessResult(config)
  } catch (error) {
    logger.error('SMTP connection test failed', buildLogContext(config, {
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      'api.smtp.connection_failed',
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

async function getPlatformMailContext(app) {
  const db = app?.get?.('postgresqlClient')
  if (!db) {
    return {
      platformName: 'Nebulynk',
      defaultLocale: 'en'
    }
  }

  const platformNameRow = await db('platform_settings').where('key', 'platform_name').first()
  const defaultLocaleRow = await db('platform_settings').where('key', 'default_locale').first()

  return {
    platformName: platformNameRow?.value || 'Nebulynk',
    defaultLocale: defaultLocaleRow?.value || 'en'
  }
}

export async function sendTestEmail(app, { to }) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('SMTP test mail skipped because SMTP is not configured', { to })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const { platformName } = await getPlatformMailContext(app)

  try {
    const transport = await getTransporter(app, config)
    const safePlatformName = escapeHtml(platformName)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to,
      subject: `${platformName} SMTP Test`,
      text: `This is a Nebulynk SMTP test email for ${platformName}.`,
      html: `<p>This is a <strong>Nebulynk</strong> SMTP test email for <strong>${safePlatformName}</strong>.</p>`
    })

    if (!hasAcceptedRecipients(info)) {
      logger.error('SMTP test mail failed because no recipients were accepted', buildLogContext(config, {
        to,
        accepted: info?.accepted || [],
        rejected: info?.rejected || []
      }))
      return buildFailureResult(
        'api.smtp.no_accepted_recipients',
        'SMTP hat keine Empfaenger akzeptiert',
        config
      )
    }

    logger.info('SMTP test mail sent', buildLogContext(config, {
      to,
      accepted: info.accepted,
      rejected: info?.rejected || []
    }))
    return buildSuccessResult(config, {
      accepted: info.accepted
    })
  } catch (error) {
    logger.error('SMTP test mail failed', buildLogContext(config, {
      to,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      'api.smtp.delivery_failed',
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

export async function sendInviteEmail(app, {
  email,
  token,
  inviterName,
  platformName,
  message,
  locale = 'en'
}) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('Invite email skipped because SMTP is not configured', { to: email })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const frontendUrl = resolveFrontendUrl(process.env)
  const inviteUrl = `${frontendUrl}/invite/${token}`
  const safePlatformName = escapeHtml(platformName)
  const safeInviterName = escapeHtml(inviterName)
  const safeInviteUrl = escapeHtml(inviteUrl)

  const personalMessage = message
    ? `<p style="color:#ccc;font-style:italic;margin:16px 0;padding:12px;border-left:3px solid #555;background:#2a2a2a;">${escapeHtml(message)}</p>`
    : ''

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:8px;">
      <h2 style="color:#fff;margin-top:0;">${bt(locale, 'email.invite.heading', { platformName: safePlatformName })}</h2>
      <p>${bt(locale, 'email.invite.intro', { inviterName: safeInviterName, platformName: safePlatformName })}</p>
      ${personalMessage}
      <a href="${safeInviteUrl}" style="display:inline-block;padding:12px 24px;background:#18a058;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
        ${bt(locale, 'email.invite.cta')}
      </a>
      <p style="font-size:13px;opacity:0.6;margin-top:24px;">
        ${bt(locale, 'email.invite.copyLink')} <a href="${safeInviteUrl}" style="color:#63e2b7;">${safeInviteUrl}</a>
      </p>
    </div>
  `

  try {
    const transport = await getTransporter(app, config)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to: email,
      subject: bt(locale, 'email.invite.subject', { platformName }),
      html
    })

    if (!hasAcceptedRecipients(info)) {
      logger.error('Invite email failed because no recipients were accepted', buildLogContext(config, {
        to: email,
        accepted: info?.accepted || [],
        rejected: info?.rejected || []
      }))
      return buildFailureResult(
        'api.smtp.no_accepted_recipients',
        'SMTP hat keine Empfaenger akzeptiert',
        config
      )
    }

    logger.info('Invite email sent', buildLogContext(config, {
      to: email,
      accepted: info.accepted,
      rejected: info?.rejected || []
    }))
    return buildSuccessResult(config, {
      accepted: info.accepted
    })
  } catch (error) {
    logger.error('Invite email delivery failed', buildLogContext(config, {
      to: email,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      `api.smtp.${slugifyValue(error?.code, 'delivery_failed')}`,
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

export async function sendPasswordResetEmail(app, {
  email,
  token,
  locale = 'en'
}) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('Password reset email skipped because SMTP is not configured', { to: email })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const { platformName, defaultLocale } = await getPlatformMailContext(app)
  const effectiveLocale = normalizeString(locale) || defaultLocale || 'en'
  const resetUrl = buildPasswordResetUrl({
    frontendUrl: resolveFrontendUrl(process.env),
    token
  })
  const safePlatformName = escapeHtml(platformName)
  const safeResetUrl = escapeHtml(resetUrl)

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:8px;">
      <h2 style="color:#fff;margin-top:0;">${bt(effectiveLocale, 'email.passwordReset.heading', { platformName: safePlatformName })}</h2>
      <p>${bt(effectiveLocale, 'email.passwordReset.intro', { platformName: safePlatformName })}</p>
      <p>${bt(effectiveLocale, 'email.passwordReset.expiry')}</p>
      <a href="${safeResetUrl}" style="display:inline-block;padding:12px 24px;background:#18a058;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
        ${bt(effectiveLocale, 'email.passwordReset.cta')}
      </a>
      <p style="font-size:13px;opacity:0.6;margin-top:24px;">
        ${bt(effectiveLocale, 'email.passwordReset.copyLink')} <a href="${safeResetUrl}" style="color:#63e2b7;">${safeResetUrl}</a>
      </p>
    </div>
  `

  try {
    const transport = await getTransporter(app, config)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to: email,
      subject: bt(effectiveLocale, 'email.passwordReset.subject', { platformName }),
      html
    })

    if (!hasAcceptedRecipients(info)) {
      logger.error('Password reset email failed because no recipients were accepted', buildLogContext(config, {
        to: email,
        accepted: info?.accepted || [],
        rejected: info?.rejected || []
      }))
      return buildFailureResult(
        'api.smtp.no_accepted_recipients',
        'SMTP hat keine Empfaenger akzeptiert',
        config
      )
    }

    logger.info('Password reset email sent', buildLogContext(config, {
      to: email,
      accepted: info.accepted,
      rejected: info?.rejected || []
    }))
    return buildSuccessResult(config, {
      accepted: info.accepted
    })
  } catch (error) {
    logger.error('Password reset email delivery failed', buildLogContext(config, {
      to: email,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      `api.smtp.${slugifyValue(error?.code, 'delivery_failed')}`,
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

export async function sendRegistrationConfirmationEmail(app, {
  email,
  token,
  locale = 'en'
}) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('Registration confirmation email skipped because SMTP is not configured', { to: email })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const { platformName, defaultLocale } = await getPlatformMailContext(app)
  const effectiveLocale = normalizeString(locale) || defaultLocale || 'en'
  const confirmationUrl = buildRegistrationConfirmationUrl({
    frontendUrl: resolveFrontendUrl(process.env),
    token
  })
  const safePlatformName = escapeHtml(platformName)
  const safeConfirmationUrl = escapeHtml(confirmationUrl)
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:8px;">
      <h2 style="color:#fff;margin-top:0;">${bt(effectiveLocale, 'email.selfRegistration.confirmation.heading', { platformName: safePlatformName })}</h2>
      <p>${bt(effectiveLocale, 'email.selfRegistration.confirmation.intro', { platformName: safePlatformName })}</p>
      <p>${bt(effectiveLocale, 'email.selfRegistration.confirmation.expiry')}</p>
      <a href="${safeConfirmationUrl}" style="display:inline-block;padding:12px 24px;background:#18a058;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
        ${bt(effectiveLocale, 'email.selfRegistration.confirmation.cta')}
      </a>
      <p style="font-size:13px;opacity:0.6;margin-top:24px;">
        ${bt(effectiveLocale, 'email.selfRegistration.confirmation.copyLink')} <a href="${safeConfirmationUrl}" style="color:#63e2b7;">${safeConfirmationUrl}</a>
      </p>
    </div>
  `

  try {
    const transport = await getTransporter(app, config)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to: email,
      subject: bt(effectiveLocale, 'email.selfRegistration.confirmation.subject', { platformName }),
      html
    })

    if (!hasAcceptedRecipients(info)) {
      return buildFailureResult('api.smtp.no_accepted_recipients', 'SMTP hat keine Empfaenger akzeptiert', config)
    }

    logger.info('Registration confirmation email sent', buildLogContext(config, {
      to: email,
      accepted: info.accepted,
      rejected: info?.rejected || []
    }))
    return buildSuccessResult(config, { accepted: info.accepted })
  } catch (error) {
    logger.error('Registration confirmation email delivery failed', buildLogContext(config, {
      to: email,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      `api.smtp.${slugifyValue(error?.code, 'delivery_failed')}`,
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

export async function sendAccountActivatedEmail(app, {
  email,
  locale = 'en'
}) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('Account activation email skipped because SMTP is not configured', { to: email })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const { platformName, defaultLocale } = await getPlatformMailContext(app)
  const effectiveLocale = normalizeString(locale) || defaultLocale || 'en'
  const loginUrl = resolveFrontendUrl(process.env)
  const safePlatformName = escapeHtml(platformName)
  const safeLoginUrl = escapeHtml(loginUrl)
  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:8px;">
      <h2 style="color:#fff;margin-top:0;">${bt(effectiveLocale, 'email.selfRegistration.activation.heading', { platformName: safePlatformName })}</h2>
      <p>${bt(effectiveLocale, 'email.selfRegistration.activation.intro', { platformName: safePlatformName })}</p>
      <a href="${safeLoginUrl}" style="display:inline-block;padding:12px 24px;background:#18a058;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
        ${bt(effectiveLocale, 'email.selfRegistration.activation.cta')}
      </a>
    </div>
  `

  try {
    const transport = await getTransporter(app, config)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to: email,
      subject: bt(effectiveLocale, 'email.selfRegistration.activation.subject', { platformName }),
      html
    })

    if (!hasAcceptedRecipients(info)) {
      return buildFailureResult('api.smtp.no_accepted_recipients', 'SMTP hat keine Empfaenger akzeptiert', config)
    }

    logger.info('Account activation email sent', buildLogContext(config, {
      to: email,
      accepted: info.accepted,
      rejected: info?.rejected || []
    }))
    return buildSuccessResult(config, { accepted: info.accepted })
  } catch (error) {
    logger.error('Account activation email delivery failed', buildLogContext(config, {
      to: email,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null,
      smtp_response: error?.response || null
    }))
    return buildFailureResult(
      `api.smtp.${slugifyValue(error?.code, 'delivery_failed')}`,
      normalizeProviderErrorMessage(error),
      config
    )
  }
}

export async function sendPlatformSecurityUpdateEmail(app, {
  user,
  releases = [],
  currentVersion,
  latestVersion
}) {
  const config = await resolveEffectiveSmtpConfig(app)
  if (!config) {
    logger.warn('Platform security update email skipped because SMTP is not configured', { userId: user?.id })
    return buildFailureResult('api.smtp.not_configured', 'SMTP ist nicht konfiguriert', null)
  }

  const { platformName, defaultLocale } = await getPlatformMailContext(app)
  const locale = normalizeString(user?.preferred_locale) || defaultLocale || 'en'
  const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 }
  let highestSeverity = 'low'
  for (const release of releases) {
    for (const advisory of release.security || []) {
      if ((severityOrder[advisory.severity] || 0) > severityOrder[highestSeverity]) highestSeverity = advisory.severity
    }
  }

  const frontendUrl = resolveFrontendUrl(process.env)
  const updateUrl = `${frontendUrl}/admin?tab=updates`
  const safePlatformName = escapeHtml(platformName)
  const safeUpdateUrl = escapeHtml(updateUrl)
  const releaseItems = releases.map((release) => {
    const localizedTitle = release.title?.[locale] || release.title?.en || release.version
    const securityItems = (release.security || []).map((advisory) => {
      const summary = advisory.summary?.[locale] || advisory.summary?.en || advisory.severity
      return `<li><strong>${escapeHtml(advisory.severity.toUpperCase())}</strong>: ${escapeHtml(summary)}</li>`
    }).join('')
    return `<li><strong>${escapeHtml(release.version)} – ${escapeHtml(localizedTitle)}</strong><ul>${securityItems}</ul></li>`
  }).join('')
  const html = `
    <div style="font-family:sans-serif;max-width:620px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:8px;">
      <h2 style="color:#ff6b6b;margin-top:0;">${bt(locale, 'email.platformSecurityUpdate.heading', { platformName: safePlatformName })}</h2>
      <p>${bt(locale, 'email.platformSecurityUpdate.intro', { currentVersion: escapeHtml(currentVersion) })}</p>
      <p><strong>${bt(locale, 'email.platformSecurityUpdate.target', { latestVersion: escapeHtml(latestVersion) })}</strong></p>
      <ul>${releaseItems}</ul>
      <a href="${safeUpdateUrl}" style="display:inline-block;padding:12px 24px;background:#d03050;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin:16px 0;">
        ${bt(locale, 'email.platformSecurityUpdate.cta')}
      </a>
      <p style="font-size:13px;opacity:0.7;margin-top:24px;">${bt(locale, 'email.platformSecurityUpdate.footer')}</p>
    </div>
  `

  try {
    const transport = await getTransporter(app, config)
    const info = await transport.sendMail({
      from: formatFromAddress(config, platformName),
      to: user.email,
      subject: bt(locale, 'email.platformSecurityUpdate.subject', {
        platformName,
        severity: highestSeverity.toUpperCase()
      }),
      html
    })
    if (!hasAcceptedRecipients(info)) {
      return buildFailureResult('api.smtp.no_accepted_recipients', 'SMTP hat keine Empfaenger akzeptiert', config)
    }
    logger.info('Platform security update email sent', buildLogContext(config, {
      userId: user.id,
      releaseVersions: releases.map((release) => release.version),
      accepted: info.accepted
    }))
    return buildSuccessResult(config, { accepted: info.accepted })
  } catch (error) {
    logger.error('Platform security update email delivery failed', buildLogContext(config, {
      userId: user?.id,
      error: normalizeProviderErrorMessage(error),
      smtp_error_code: error?.code || null,
      smtp_response_code: error?.responseCode || null
    }))
    return buildFailureResult('api.smtp.delivery_failed', normalizeProviderErrorMessage(error), config)
  }
}
