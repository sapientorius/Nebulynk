import { createId } from '@paralleldrive/cuid2'
import { conflict, forbidden, notFound, badRequest } from '../../lib/errors.js'
import { getEmailDeliveryStatus, sendRegistrationConfirmationEmail } from '../../email.js'
import {
  REGISTRATION_STATUS,
  REGISTRATION_TOKEN_WINDOW_MS,
  createRegistrationToken,
  getPlatformDefaultLocale,
  getSelfRegistrationSettings,
  hashRegistrationToken,
  isEmailDomainAllowed,
  isPlatformInitialized
} from '../../lib/self-registration.js'
import { getConfiguredPasswordStrengthPolicy, serializePasswordStrengthPolicy } from '../../lib/password-policy.js'
import { validate } from '../../schemas/validators.js'
import {
  createSelfRegistrationCreateRateLimitHook,
  createSelfRegistrationTokenRateLimitHook
} from '../../hooks/rate-limit.js'
import { createSchema, patchSchema } from './self-registration.schema.js'
import { assignDefaultMemberRole, normalizeEmail } from '../../lib/self-registration.js'

function isExpired(expiresAt, now) {
  const expiresAtMs = Date.parse(expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()
}

function buildPendingResponse({ delivery = 'manual' } = {}) {
  return {
    ok: true,
    registration_status: REGISTRATION_STATUS.pendingEmailVerification,
    confirmation_delivery: delivery
  }
}

export class SelfRegistrationService {
  constructor(app, {
    now = () => new Date(),
    createToken = createRegistrationToken,
    hashToken = hashRegistrationToken,
    sendConfirmationEmail = sendRegistrationConfirmationEmail,
    getEmailDelivery = getEmailDeliveryStatus
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
    this.createToken = createToken
    this.hashToken = hashToken
    this.sendConfirmationEmail = sendConfirmationEmail
    this.getEmailDelivery = getEmailDelivery
  }

  async find() {
    const [initialized, registrationSettings, passwordPolicy] = await Promise.all([
      isPlatformInitialized(this.db),
      getSelfRegistrationSettings(this.db),
      getConfiguredPasswordStrengthPolicy(this.db)
    ])

    return {
      enabled: initialized && registrationSettings.enabled,
      password_policy: serializePasswordStrengthPolicy(passwordPolicy.level)
    }
  }

  async create(data) {
    const initialized = await isPlatformInitialized(this.db)
    const settings = await getSelfRegistrationSettings(this.db)
    if (!initialized || !settings.enabled) {
      throw forbidden('api.self_registration.disabled', {}, 'Die Selbstregistrierung ist deaktiviert')
    }

    const email = normalizeEmail(data.email)
    if (!isEmailDomainAllowed(email, settings.allowedDomains)) {
      throw forbidden(
        'api.self_registration.domain_not_allowed',
        {},
        'E-Mail-Adressen dieser Domain sind nicht fuer die Registrierung zugelassen'
      )
    }

    const existingUser = await this.db('users').where('email', email).first()
    if (existingUser) {
      throw conflict('api.self_registration.email_already_registered', {}, 'Diese E-Mail-Adresse wird bereits verwendet')
    }

    const defaultLocale = await getPlatformDefaultLocale(this.db)
    let user
    try {
      user = await this.app.service('users').create({
        email,
        password: data.password,
        display_name: data.display_name.trim(),
        preferred_locale: defaultLocale,
        is_admin: false,
        is_verified: false,
        registration_status: REGISTRATION_STATUS.pendingEmailVerification,
        email_verified_at: null
      }, {})
    } catch (error) {
      if (error?.code === '23505') {
        throw conflict('api.self_registration.email_already_registered', {}, 'Diese E-Mail-Adresse wird bereits verwendet')
      }
      throw error
    }

    const deliveryStatus = await this.getEmailDelivery(this.app)
    if (!deliveryStatus.configured) {
      return buildPendingResponse()
    }

    const now = this.now()
    const token = this.createToken()
    const tokenRecord = {
      id: createId(),
      user_id: user.id,
      token_hash: this.hashToken(token),
      expires_at: new Date(now.getTime() + REGISTRATION_TOKEN_WINDOW_MS).toISOString(),
      consumed_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    }

    await this.db('registration_email_tokens').insert(tokenRecord)
    const emailResult = await this.sendConfirmationEmail(this.app, {
      email,
      token,
      locale: defaultLocale
    })

    if (!emailResult?.ok) {
      await this.db('registration_email_tokens').where('id', tokenRecord.id).del()
      return buildPendingResponse()
    }

    return buildPendingResponse({ delivery: 'email' })
  }

  async patch(token) {
    const normalizedToken = typeof token === 'string' ? token.trim() : ''
    if (!normalizedToken) {
      throw badRequest('api.self_registration.token_required', {}, 'Bestaetigungslink ist erforderlich')
    }

    const now = this.now()
    return this.db.transaction(async (trx) => {
      const tokenRecord = await trx('registration_email_tokens')
        .where('token_hash', this.hashToken(normalizedToken))
        .forUpdate()
        .first()

      if (!tokenRecord) {
        throw notFound('api.self_registration.invalid_token', {}, 'Bestaetigungslink wurde nicht gefunden')
      }
      if (tokenRecord.consumed_at) {
        throw badRequest('api.self_registration.token_already_used', {}, 'Bestaetigungslink wurde bereits verwendet')
      }
      if (isExpired(tokenRecord.expires_at, now)) {
        throw badRequest('api.self_registration.token_expired', {}, 'Bestaetigungslink ist abgelaufen')
      }

      const user = await trx('users').where('id', tokenRecord.user_id).first()
      if (!user || user.registration_status !== REGISTRATION_STATUS.pendingEmailVerification) {
        throw notFound('api.self_registration.invalid_token', {}, 'Bestaetigungslink wurde nicht gefunden')
      }

      const settings = await getSelfRegistrationSettings(trx)
      const registrationStatus = settings.requiresAdminApproval
        ? REGISTRATION_STATUS.pendingAdminApproval
        : REGISTRATION_STATUS.active
      const nowIso = now.toISOString()

      await trx('registration_email_tokens').where('id', tokenRecord.id).update({
        consumed_at: nowIso,
        updated_at: nowIso
      })
      await trx('users').where('id', user.id).update({
        is_verified: true,
        email_verified_at: nowIso,
        registration_status: registrationStatus,
        updated_at: nowIso
      })

      if (registrationStatus === REGISTRATION_STATUS.active) {
        await assignDefaultMemberRole(trx, user.id)
      }

      return {
        ok: true,
        registration_status: registrationStatus,
        activated: registrationStatus === REGISTRATION_STATUS.active
      }
    })
  }
}

export const selfRegistration = (app, overrides = {}) => {
  app.use('self-registration', new SelfRegistrationService(app, overrides), {
    methods: ['find', 'create', 'patch'],
    events: []
  })

  app.service('self-registration').hooks({
    before: {
      create: [validate(createSchema), createSelfRegistrationCreateRateLimitHook()],
      patch: [validate(patchSchema), createSelfRegistrationTokenRateLimitHook()]
    }
  })
}
