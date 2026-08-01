import { createId } from '@paralleldrive/cuid2'
import { authenticateRequest } from './authenticate-request.js'
import { logger } from '../logger.js'
import { attachErrorMetadata, badRequest, buildErrorBody, forbidden, notFound } from '../lib/errors.js'
import { assertUserAccountActive, isGuestAccount } from '../lib/account-state.js'
import { revokeAllUserRefreshSessions } from '../lib/auth-sessions.js'
import { consumeRateLimitBuckets, getRequestIp } from '../hooks/rate-limit.js'
import {
  buildStoredPasskeyCredential,
  defaultPasskeyHelpers,
  PASSKEY_CHALLENGE_WINDOW_MS
} from '../lib/passkeys.js'
import {
  consumePasskeyChallenge,
  createPasskeyChallenge,
  getPasskeyByCredentialId,
  getPasskeyChallenge,
  listUserPasskeys,
  isPasskeyChallengeUsable
} from '../lib/passkey-data.js'

const CONFIRMATION_TEXT = 'TRANSFER_PRIMARY_ADMIN'
const PASSKEY_FLOW = 'primary-admin-transfer'

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function getPasskeyHelpers(app) {
  return app.get('passkeyHelpers') || defaultPasskeyHelpers
}

function getExpectedOrigins(app) {
  return app.get('frontendOrigins') || []
}

function getExpectedRpId(app) {
  return app.get('passkeyRpId')
}

async function applyTransferRateLimit(app, ctx, userId) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.primary_admin.rate_limited',
    buckets: [
      {
        name: 'primary-admin-transfer:ip',
        key: getRequestIp({ headers: ctx.headers, ip: ctx.ip }),
        limit: 20
      },
      {
        name: 'primary-admin-transfer:user',
        key: userId,
        limit: 10
      }
    ]
  })
}

async function requirePrimaryAdmin(user) {
  if (!user?.is_primary_admin) {
    throw forbidden(
      'api.primary_admin.current_primary_admin_required',
      {},
      'Only the current primary admin can transfer primary admin ownership'
    )
  }
}

function validateTargetUser(currentUser, targetUser) {
  if (!targetUser) {
    throw notFound('api.users.not_found', {}, 'User not found')
  }
  if (targetUser.id === currentUser.id) {
    throw badRequest('api.primary_admin.self_transfer_not_allowed', {}, 'Primary admin cannot be transferred to the same account')
  }
  if (isGuestAccount(targetUser) || targetUser.account_type !== 'member') {
    throw badRequest('api.primary_admin.target_must_be_active_member', {}, 'Target user must be an active member account')
  }
  assertUserAccountActive(targetUser)
}

async function verifyCurrentPassword(app, user, password) {
  if (typeof password !== 'string' || !password.trim()) {
    throw badRequest('api.primary_admin.current_password_required', {}, 'Current password is required')
  }

  try {
    await app.service('authentication').create({
      strategy: 'local',
      email: user.email,
      password
    }, {})
  } catch (error) {
    if (error?.name === 'NotAuthenticated' || error?.className === 'not-authenticated') {
      throw badRequest('api.primary_admin.invalid_current_password', {}, 'Current password is incorrect')
    }
    throw error
  }
}

async function verifyTransferPasskey(app, db, user, reauth) {
  const challengeId = typeof reauth?.challenge_id === 'string' ? reauth.challenge_id.trim() : ''
  const authenticationResponse = reauth?.authentication_response
  if (!challengeId || !authenticationResponse || typeof authenticationResponse !== 'object') {
    throw badRequest('api.primary_admin.invalid_passkey_reauth', {}, 'Passkey reauthentication is invalid')
  }

  const challenge = await getPasskeyChallenge(db, challengeId)
  if (!isPasskeyChallengeUsable(challenge, PASSKEY_FLOW) || challenge.user_id !== user.id) {
    throw badRequest('api.primary_admin.invalid_passkey_challenge', {}, 'Passkey challenge is invalid')
  }

  const passkey = await getPasskeyByCredentialId(db, authenticationResponse.id)
  if (!passkey || passkey.user_id !== user.id) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.primary_admin.passkey_not_found', {}, 'Passkey credential not found')
  }

  let verification
  try {
    verification = await getPasskeyHelpers(app).verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigins(app),
      expectedRPID: getExpectedRpId(app),
      requireUserVerification: true,
      credential: buildStoredPasskeyCredential(passkey)
    })
  } catch (error) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.primary_admin.passkey_authentication_failed', {}, error?.message || 'Passkey authentication failed')
  }

  if (!verification?.verified) {
    await consumePasskeyChallenge(db, challenge.id)
    throw badRequest('api.primary_admin.passkey_authentication_failed', {}, 'Passkey authentication failed')
  }

  const nowIso = new Date().toISOString()
  await db.transaction(async (trx) => {
    await trx('user_passkeys')
      .where('id', passkey.id)
      .update({
        counter: verification.authenticationInfo.newCounter,
        device_type: verification.authenticationInfo.credentialDeviceType,
        backed_up: verification.authenticationInfo.credentialBackedUp,
        last_used_at: nowIso,
        updated_at: nowIso
      })
    await consumePasskeyChallenge(trx, challenge.id, nowIso)
  })
}

async function verifyReauth(app, db, user, reauth) {
  if (reauth?.method === 'password') {
    await verifyCurrentPassword(app, user, reauth.current_password)
    return
  }

  if (reauth?.method === 'passkey') {
    await verifyTransferPasskey(app, db, user, reauth)
    return
  }

  throw badRequest('api.primary_admin.reauth_required', {}, 'Password or passkey reauthentication is required')
}

async function ensurePlatformAdminRole(trx, userId) {
  const adminRole = await trx('roles').where({ name: 'platform:admin', scope: 'platform' }).first()
  if (!adminRole) return

  const existing = await trx('user_roles')
    .where({ user_id: userId, role_id: adminRole.id })
    .first()
  if (existing) return

  await trx('user_roles').insert({
    id: createId(),
    user_id: userId,
    role_id: adminRole.id
  })
}

async function transferPrimaryAdmin(db, currentUser, targetUser) {
  const nowIso = new Date().toISOString()
  await db.transaction(async (trx) => {
    await trx('users')
      .where('id', currentUser.id)
      .update({ is_primary_admin: false, updated_at: nowIso })
    await trx('users')
      .where('id', targetUser.id)
      .update({ is_primary_admin: true, is_admin: true, updated_at: nowIso })
    await ensurePlatformAdminRole(trx, targetUser.id)
  })
}

export function configurePrimaryAdminTransferRoutes(app) {
  app.use(async (ctx, next) => {
    const isPasskeyOptionsRequest = ctx.path === '/admin/primary-admin-transfer/passkey-options' && ctx.method === 'POST'
    const isTransferRequest = ctx.path === '/admin/primary-admin-transfer' && ctx.method === 'POST'

    if (!isPasskeyOptionsRequest && !isTransferRequest) {
      return next()
    }

    const db = app.get('postgresqlClient')

    try {
      const user = await authenticateRequest(app, ctx)
      if (!user) return
      await requirePrimaryAdmin(user)
      await applyTransferRateLimit(app, ctx, user.id)

      if (isPasskeyOptionsRequest) {
        const passkeys = await listUserPasskeys(db, user.id)
        if (passkeys.length === 0) {
          throw badRequest('api.primary_admin.no_passkey_available', {}, 'No passkey is available for this account')
        }

        const options = await getPasskeyHelpers(app).generateAuthenticationOptions({
          rpID: getExpectedRpId(app),
          userVerification: 'required',
          allowCredentials: passkeys.map((passkey) => ({
            id: passkey.credential_id,
            transports: (() => {
              try {
                return JSON.parse(passkey.transports || '[]')
              } catch {
                return []
              }
            })()
          }))
        })
        const now = new Date()
        const challenge = await createPasskeyChallenge(db, {
          id: createId(),
          user_id: user.id,
          flow: PASSKEY_FLOW,
          challenge: options.challenge,
          remember: false,
          expires_at: new Date(now.getTime() + PASSKEY_CHALLENGE_WINDOW_MS).toISOString(),
          used_at: null,
          created_ip: ctx.ip,
          user_agent: ctx.get('User-Agent') || null,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        })

        ctx.status = 200
        ctx.body = { challengeId: challenge.id, options }
        return
      }

      const targetUserId = typeof ctx.request.body?.target_user_id === 'string'
        ? ctx.request.body.target_user_id.trim()
        : ''
      if (!targetUserId) {
        throw badRequest('api.primary_admin.target_required', {}, 'Target user is required')
      }
      if (ctx.request.body?.confirmation !== CONFIRMATION_TEXT) {
        throw badRequest('api.primary_admin.confirmation_required', {}, 'Transfer confirmation is required')
      }

      const targetUser = await db('users').where('id', targetUserId).first()
      validateTargetUser(user, targetUser)
      await verifyReauth(app, db, user, ctx.request.body?.reauth)
      await transferPrimaryAdmin(db, user, targetUser)
      await revokeAllUserRefreshSessions(app, targetUser.id)

      ctx.status = 200
      ctx.body = {
        ok: true,
        previous_primary_admin_id: user.id,
        primary_admin_id: targetUser.id
      }
    } catch (error) {
      if (error?.statusCode || error?.code) {
        const normalized = attachErrorMetadata(error)
        sendError(
          ctx,
          normalized.statusCode || normalized.code || 400,
          normalized.error_code || normalized.data?.error_code || 'errors.unexpected',
          normalized.message || 'Request failed',
          normalized.error_params || normalized.data?.error_params || {}
        )
        return
      }

      logger.error('Primary admin transfer route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        path: ctx.path,
        method: ctx.method,
        ip: ctx.ip
      })
      sendError(ctx, 500, 'api.primary_admin.unexpected_error', 'Primary admin transfer failed unexpectedly')
    }
  })
}
