import { createId } from '@paralleldrive/cuid2'
import { authenticateRequest } from './authenticate-request.js'
import { logger } from '../logger.js'
import { buildErrorBody, attachErrorMetadata, badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { isGuestAccount } from '../lib/account-state.js'
import { decryptTwoFactorSecret, encryptTwoFactorSecret } from '../lib/two-factor-secrets.js'
import {
  buildOtpauthUrl,
  buildQrSvg,
  formatManualEntryKey,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
  TWO_FACTOR_PENDING_WINDOW_MS
} from '../lib/two-factor.js'
import {
  clearTwoFactorState,
  countRemainingRecoveryCodes,
  getActiveTwoFactor,
  getPendingTwoFactor,
  getUsablePendingTwoFactor,
  replaceRecoveryCodes,
  revokeLoginChallengesForUser
} from '../lib/two-factor-data.js'
import { hasUserPlatformPermission } from '../lib/user-permissions.js'
import { revokeAllUserRefreshSessions } from '../lib/auth-sessions.js'

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function buildRequestLogContext(ctx) {
  return {
    path: ctx.path,
    method: ctx.method,
    ip: ctx.ip,
    userAgent: ctx.get('User-Agent') || null
  }
}

function isInvalidCurrentPasswordError(error) {
  return error?.name === 'NotAuthenticated' || error?.className === 'not-authenticated'
}

function requireTwoFactorEligibleMember(user) {
  if (isGuestAccount(user)) {
    throw forbidden(
      'api.two_factor.guest_accounts_forbidden',
      {},
      'Guest accounts cannot use two-factor authentication'
    )
  }
}

function validateRequiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    return { field, message: 'must be a non-empty string', params: {} }
  }
  return null
}

async function verifyCurrentPassword(app, user, password) {
  try {
    await app.service('authentication').create({
      strategy: 'local',
      email: user.email,
      password
    }, {})
  } catch (error) {
    if (isInvalidCurrentPasswordError(error)) {
      throw badRequest(
        'api.password_change.invalid_current_password',
        {},
        'Current password is incorrect'
      )
    }
    throw error
  }
}

export function configureUserTwoFactorRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const adminResetMatch = /^\/users\/([^/]+)\/2fa\/reset$/.exec(ctx.path)
    const isSelfStatusRequest = ctx.path === '/users/me/2fa' && ctx.method === 'GET'
    const isSelfSetupRequest = ctx.path === '/users/me/2fa/setup' && ctx.method === 'POST'
    const isSelfConfirmRequest = ctx.path === '/users/me/2fa/confirm' && ctx.method === 'POST'
    const isSelfRegenerateRequest = ctx.path === '/users/me/2fa/recovery-codes/regenerate' && ctx.method === 'POST'
    const isSelfDisableRequest = ctx.path === '/users/me/2fa/disable' && ctx.method === 'POST'
    const isAdminResetRequest = Boolean(adminResetMatch) && ctx.method === 'POST'

    if (
      !isSelfStatusRequest
      && !isSelfSetupRequest
      && !isSelfConfirmRequest
      && !isSelfRegenerateRequest
      && !isSelfDisableRequest
      && !isAdminResetRequest
    ) {
      return next()
    }

    const user = await authenticateRequest(app, ctx)
    if (!user) {
      return
    }

    const db = app.get('postgresqlClient')

    try {
      if (isAdminResetRequest) {
        const canManageUsers = await hasUserPlatformPermission(app, user.id, 'manage_users')
        if (!canManageUsers) {
          throw forbidden(
            'api.permissions.missing_required_permission',
            { required: ['manage_users'] },
            'Missing permission: manage_users'
          )
        }

        const targetUserId = adminResetMatch[1]
        const targetUser = await db('users').where('id', targetUserId).first()
        if (!targetUser) {
          throw notFound('api.users.not_found', {}, 'User not found')
        }

        await db.transaction(async (trx) => {
          await clearTwoFactorState(trx, targetUser.id)
          await revokeLoginChallengesForUser(trx, targetUser.id, new Date().toISOString())
        })
        await revokeAllUserRefreshSessions(app, targetUser.id)

        ctx.status = 200
        ctx.body = {
          ok: true,
          user_id: targetUser.id,
          enabled: false
        }
        return
      }

      requireTwoFactorEligibleMember(user)

      if (isSelfStatusRequest) {
        const active = await getActiveTwoFactor(db, user.id)
        const pending = await getUsablePendingTwoFactor(db, user.id)

        ctx.status = 200
        ctx.body = {
          enabled: Boolean(active),
          method: active?.method || null,
          recoveryCodesRemaining: active ? await countRemainingRecoveryCodes(db, user.id) : 0,
          pendingSetup: Boolean(pending)
        }
        return
      }

      if (isSelfSetupRequest) {
        if (await getActiveTwoFactor(db, user.id)) {
          throw conflict('api.two_factor.already_enabled', {}, 'Two-factor authentication is already enabled')
        }

        const secret = generateTotpSecret()
        const now = new Date()
        const nowIso = now.toISOString()
        const expiresAt = new Date(now.getTime() + TWO_FACTOR_PENDING_WINDOW_MS).toISOString()
        const encryptedSecret = encryptTwoFactorSecret(app, secret)
        const existing = await getPendingTwoFactor(db, user.id)

        if (existing) {
          await db('user_two_factor_pending')
            .where('user_id', user.id)
            .update({
              encrypted_secret: encryptedSecret,
              expires_at: expiresAt,
              updated_at: nowIso
            })
        } else {
          await db('user_two_factor_pending').insert({
            user_id: user.id,
            encrypted_secret: encryptedSecret,
            expires_at: expiresAt,
            created_at: nowIso,
            updated_at: nowIso
          })
        }

        const manualKey = formatManualEntryKey(secret)
        const otpauthUrl = buildOtpauthUrl({
          email: user.email,
          secret
        })

        ctx.status = 200
        ctx.body = {
          pendingSetup: true,
          expiresAt,
          manualKey,
          otpauthUrl,
          qrSvg: await buildQrSvg({
            email: user.email,
            manualKey,
            otpauthUrl
          })
        }
        return
      }

      if (isSelfConfirmRequest) {
        const currentPasswordError = validateRequiredString(ctx.request.body?.current_password, '/current_password')
        const codeError = validateRequiredString(ctx.request.body?.code, '/code')
        if (currentPasswordError || codeError) {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [currentPasswordError, codeError].filter(Boolean)
          })
          return
        }

        if (await getActiveTwoFactor(db, user.id)) {
          throw conflict('api.two_factor.already_enabled', {}, 'Two-factor authentication is already enabled')
        }

        const pending = await getUsablePendingTwoFactor(db, user.id)
        if (!pending) {
          throw badRequest('api.two_factor.setup_required', {}, 'Two-factor setup must be started first')
        }

        await verifyCurrentPassword(app, user, ctx.request.body.current_password)
        const secret = decryptTwoFactorSecret(app, pending.encrypted_secret)
        if (!verifyTotpCode(secret, ctx.request.body.code)) {
          throw badRequest('api.two_factor.invalid_code', {}, 'A valid authentication code is required')
        }

        const nowIso = new Date().toISOString()
        const recoveryCodes = generateRecoveryCodes()

        await db.transaction(async (trx) => {
          await trx('user_two_factor').insert({
            user_id: user.id,
            method: 'totp',
            encrypted_secret: encryptTwoFactorSecret(app, secret),
            enabled_at: nowIso,
            last_used_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso
          })
          await trx('user_two_factor_pending').where('user_id', user.id).del()
          await replaceRecoveryCodes(
            trx,
            user.id,
            recoveryCodes.map((entry) => entry.code_hash),
            nowIso,
            createId
          )
          await revokeLoginChallengesForUser(trx, user.id, nowIso)
        })

        ctx.status = 200
        ctx.body = {
          enabled: true,
          method: 'totp',
          recoveryCodes: recoveryCodes.map((entry) => entry.code),
          recoveryCodesRemaining: recoveryCodes.length
        }
        return
      }

      if (isSelfRegenerateRequest || isSelfDisableRequest) {
        const currentPasswordError = validateRequiredString(ctx.request.body?.current_password, '/current_password')
        const codeError = validateRequiredString(ctx.request.body?.code, '/code')
        if (currentPasswordError || codeError) {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [currentPasswordError, codeError].filter(Boolean)
          })
          return
        }

        const active = await getActiveTwoFactor(db, user.id)
        if (!active) {
          throw badRequest('api.two_factor.not_enabled', {}, 'Two-factor authentication is not enabled')
        }

        await verifyCurrentPassword(app, user, ctx.request.body.current_password)
        const secret = decryptTwoFactorSecret(app, active.encrypted_secret)
        if (!verifyTotpCode(secret, ctx.request.body.code)) {
          throw badRequest('api.two_factor.invalid_code', {}, 'A valid authentication code is required')
        }

        const nowIso = new Date().toISOString()

        if (isSelfRegenerateRequest) {
          const recoveryCodes = generateRecoveryCodes()
          await db.transaction(async (trx) => {
            await trx('user_two_factor')
              .where('user_id', user.id)
              .update({
                last_used_at: nowIso,
                updated_at: nowIso
              })
            await replaceRecoveryCodes(
              trx,
              user.id,
              recoveryCodes.map((entry) => entry.code_hash),
              nowIso,
              createId
            )
          })

          ctx.status = 200
          ctx.body = {
            recoveryCodes: recoveryCodes.map((entry) => entry.code),
            recoveryCodesRemaining: recoveryCodes.length
          }
          return
        }

        await db.transaction(async (trx) => {
          await clearTwoFactorState(trx, user.id)
          await revokeLoginChallengesForUser(trx, user.id, nowIso)
        })

        ctx.status = 200
        ctx.body = {
          ok: true,
          enabled: false
        }
      }
    } catch (error) {
      if (error?.statusCode || error?.code) {
        const normalized = attachErrorMetadata(error)
        const status = normalized.statusCode || normalized.code || 400
        sendError(
          ctx,
          status,
          normalized.error_code || normalized.data?.error_code || 'errors.unexpected',
          normalized.message || 'Request failed',
          normalized.error_params || normalized.data?.error_params || {}
        )
        return
      }

      logger.error('User 2FA route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        ...buildRequestLogContext(ctx)
      })
      sendError(ctx, 500, 'api.two_factor.unexpected_error', 'Two-factor request failed unexpectedly')
    }
  })
}
