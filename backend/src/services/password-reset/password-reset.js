import { createId } from '@paralleldrive/cuid2'
import { sendPasswordResetEmail } from '../../email.js'
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_WINDOW_MS
} from '../../lib/password-reset.js'
import { revokeAllUserRefreshSessions } from '../../lib/auth-sessions.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { validate } from '../../schemas/validators.js'
import {
  createPasswordResetRequestRateLimitHook,
  createPasswordResetTokenRateLimitHook
} from '../../hooks/rate-limit.js'
import { patchSchema, createSchema } from './password-reset.schema.js'

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeToken(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isExpired(expiresAt, now = Date.now()) {
  const expiresAtMs = Date.parse(expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= now
}

function isEligibleUser(user) {
  return Boolean(
    user
    && user.account_type === 'member'
    && !user.disabled_at
  )
}

async function getPlatformDefaultLocale(db) {
  const row = await db('platform_settings').where('key', 'default_locale').first()
  return row?.value || 'en'
}

export class PasswordResetService {
  constructor(app, {
    now = () => new Date(),
    createToken = createPasswordResetToken,
    hashToken = hashPasswordResetToken,
    resetWindowMs = PASSWORD_RESET_WINDOW_MS,
    sendResetEmail = sendPasswordResetEmail,
    revokeRefreshSessions = revokeAllUserRefreshSessions
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
    this.createToken = createToken
    this.hashToken = hashToken
    this.resetWindowMs = resetWindowMs
    this.sendResetEmail = sendResetEmail
    this.revokeRefreshSessions = revokeRefreshSessions
  }

  async find(params = {}) {
    const token = normalizeToken(params.query?.token)
    if (!token) {
      throw badRequest('api.password_reset.token_required', {}, 'Token ist erforderlich')
    }

    const record = await this._resolveUsableReset(token)
    return {
      ok: true,
      expires_at: record.expires_at
    }
  }

  async create(data) {
    const email = normalizeEmail(data?.email)
    if (!email) {
      throw badRequest('api.password_reset.email_required', {}, 'E-Mail ist erforderlich')
    }

    const user = await this.db('users').where('email', email).first()
    if (!isEligibleUser(user)) {
      return { ok: true }
    }

    const locale = normalizeEmail(user.preferred_locale)
      ? user.preferred_locale
      : await getPlatformDefaultLocale(this.db)
    const now = this.now()
    const nowIso = now.toISOString()
    const expiresAt = new Date(now.getTime() + this.resetWindowMs).toISOString()
    const resetId = createId()
    const token = this.createToken()
    const tokenHash = this.hashToken(token)

    await this.db('password_resets').insert({
      id: resetId,
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      created_at: nowIso,
      updated_at: nowIso
    })

    const emailResult = await this.sendResetEmail(this.app, {
      email: user.email,
      token,
      locale
    })

    if (!emailResult?.ok) {
      await this.db('password_resets').where('id', resetId).del()
      return { ok: true }
    }

    await this.db('password_resets')
      .where('user_id', user.id)
      .whereNull('used_at')
      .where('id', '!=', resetId)
      .del()

    return { ok: true }
  }

  async patch(id, data) {
    const token = normalizeToken(id)
    if (!token) {
      throw badRequest('api.password_reset.token_required', {}, 'Token ist erforderlich')
    }

    const record = await this._resolveUsableReset(token)
    const nowIso = this.now().toISOString()

    await this.db.transaction(async (trx) => {
      const latest = await this._findResetByTokenHash(this.hashToken(token), trx)
      this._assertUsableReset(latest)

      await trx('password_resets')
        .where('user_id', latest.user_id)
        .whereNull('used_at')
        .update({
          used_at: nowIso,
          updated_at: nowIso
        })
    })

    await this.app.service('users').patch(record.user_id, {
      password: data.password
    }, {})

    await this.revokeRefreshSessions(this.app, record.user_id)

    return { ok: true }
  }

  async _resolveUsableReset(token) {
    const record = await this._findResetByTokenHash(this.hashToken(token))
    this._assertUsableReset(record)
    return record
  }

  async _findResetByTokenHash(tokenHash, db = this.db) {
    const reset = await db('password_resets')
      .where('token_hash', tokenHash)
      .first()

    if (!reset) {
      return null
    }

    const user = await db('users')
      .where('id', reset.user_id)
      .first()

    return {
      ...reset,
      email: user?.email || null,
      account_type: user?.account_type || null,
      disabled_at: user?.disabled_at || null
    }
  }

  _assertUsableReset(record) {
    if (!record || !isEligibleUser(record)) {
      throw notFound('api.password_reset.invalid_token', {}, 'Reset-Link nicht gefunden')
    }

    if (record.used_at) {
      throw badRequest('api.password_reset.already_used', {}, 'Reset-Link wurde bereits verwendet')
    }

    if (isExpired(record.expires_at, this.now().getTime())) {
      throw badRequest('api.password_reset.expired', {}, 'Reset-Link ist abgelaufen')
    }
  }
}

export const passwordReset = (app, overrides = {}) => {
  app.use('password-reset', new PasswordResetService(app, overrides), {
    methods: ['find', 'create', 'patch'],
    events: []
  })

  app.service('password-reset').hooks({
    before: {
      find: [createPasswordResetTokenRateLimitHook()],
      create: [validate(createSchema), createPasswordResetRequestRateLimitHook()],
      patch: [validate(patchSchema), createPasswordResetTokenRateLimitHook()]
    }
  })
}
