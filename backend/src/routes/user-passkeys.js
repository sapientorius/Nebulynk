import { createId } from '@paralleldrive/cuid2'
import { authenticateRequest } from './authenticate-request.js'
import { logger } from '../logger.js'
import { buildErrorBody, attachErrorMetadata, badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { assertUserAccountActive, isGuestAccount } from '../lib/account-state.js'
import { buildAuthTokenPayload } from '../lib/auth-token-version.js'
import { hasUserPlatformPermission } from '../lib/user-permissions.js'
import { revokeAllUserRefreshSessions, sanitizeUser } from '../lib/auth-sessions.js'
import { consumeRateLimitBuckets, getRequestIp } from '../hooks/rate-limit.js'
import {
  createPasskeyChallenge,
  consumePasskeyChallenge,
  deleteUserPasskeys,
  getPasskeyByCredentialId,
  getPasskeyChallenge,
  getUserPasskeyById,
  isPasskeyChallengeUsable,
  listUserPasskeys
} from '../lib/passkey-data.js'
import {
  PASSKEY_CHALLENGE_WINDOW_MS,
  buildStoredPasskeyCredential,
  createWebauthnUserId,
  defaultPasskeyHelpers,
  encodeBytesForStorage,
  normalizePasskeyName,
  serializePasskeyTransports
} from '../lib/passkeys.js'
import { issueBrowserAccessTokenJwtOptions } from '../lib/auth-sessions.js'

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

function validateRequiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    return { field, message: 'must be a non-empty string', params: {} }
  }
  return null
}

function requirePasskeyEligibleMember(user) {
  if (isGuestAccount(user)) {
    throw forbidden(
      'api.passkeys.guest_accounts_forbidden',
      {},
      'Guest accounts cannot use passkeys'
    )
  }
}

function isInvalidCurrentPasswordError(error) {
  return error?.name === 'NotAuthenticated' || error?.className === 'not-authenticated'
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

async function ensureUserWebauthnId(db, user) {
  if (typeof user.webauthn_user_id === 'string' && user.webauthn_user_id.trim()) {
    return user.webauthn_user_id
  }

  const webauthnUserId = encodeBytesForStorage(createWebauthnUserId())
  await db('users')
    .where('id', user.id)
    .update({
      webauthn_user_id: webauthnUserId
    })
  user.webauthn_user_id = webauthnUserId
  return webauthnUserId
}

async function issueBrowserLoginToken(app, user) {
  return app.service('authentication').createAccessToken(buildAuthTokenPayload(user), {
    subject: `${user.id}`,
    ...issueBrowserAccessTokenJwtOptions(app)
  })
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

async function applyPasskeyAuthenticationOptionsRateLimit(app, ctx) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.passkeys.rate_limited',
    buckets: [
      {
        name: 'passkeys-authentication-options:ip',
        key: getRequestIp({
          headers: ctx.headers,
          ip: ctx.ip
        }),
        limit: 30
      }
    ]
  })
}

async function applyPasskeyVerifyAuthenticationRateLimit(app, ctx, challengeId) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.passkeys.rate_limited',
    buckets: [
      {
        name: 'passkeys-verify-authentication:ip',
        key: getRequestIp({
          headers: ctx.headers,
          ip: ctx.ip
        }),
        limit: 30
      },
      {
        name: 'passkeys-verify-authentication:challenge',
        key: challengeId,
        limit: 10
      }
    ]
  })
}

function buildPasskeyListResponse(passkeys = []) {
  return {
    passkeys: (Array.isArray(passkeys) ? passkeys : []).map((passkey) => ({
      id: passkey.id,
      name: passkey.name || null,
      deviceType: passkey.device_type,
      backedUp: Boolean(passkey.backed_up),
      transports: (() => {
        try {
          return JSON.parse(passkey.transports || '[]')
        } catch {
          return []
        }
      })(),
      lastUsedAt: passkey.last_used_at || null,
      createdAt: passkey.created_at || null
    }))
  }
}

export function configureUserPasskeyRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const selfDeleteMatch = /^\/users\/me\/passkeys\/([^/]+)\/delete$/.exec(ctx.path)
    const adminResetMatch = /^\/users\/([^/]+)\/passkeys\/reset$/.exec(ctx.path)
    const isListRequest = ctx.path === '/users/me/passkeys' && ctx.method === 'GET'
    const isRegistrationOptionsRequest = ctx.path === '/users/me/passkeys/registration-options' && ctx.method === 'POST'
    const isVerifyRegistrationRequest = ctx.path === '/users/me/passkeys/verify-registration' && ctx.method === 'POST'
    const isDeleteRequest = Boolean(selfDeleteMatch) && ctx.method === 'POST'
    const isAdminResetRequest = Boolean(adminResetMatch) && ctx.method === 'POST'
    const isAuthenticationOptionsRequest = ctx.path === '/auth/passkeys/authentication-options' && ctx.method === 'POST'
    const isVerifyAuthenticationRequest = ctx.path === '/auth/passkeys/verify-authentication' && ctx.method === 'POST'

    if (
      !isListRequest
      && !isRegistrationOptionsRequest
      && !isVerifyRegistrationRequest
      && !isDeleteRequest
      && !isAdminResetRequest
      && !isAuthenticationOptionsRequest
      && !isVerifyAuthenticationRequest
    ) {
      return next()
    }

    const db = app.get('postgresqlClient')
    const passkeyHelpers = getPasskeyHelpers(app)
    const expectedOrigins = getExpectedOrigins(app)
    const expectedRpId = getExpectedRpId(app)

    try {
      if (isAuthenticationOptionsRequest) {
        await applyPasskeyAuthenticationOptionsRateLimit(app, ctx)

        const remember = ctx.request.body?.remember === true
        const options = await passkeyHelpers.generateAuthenticationOptions({
          rpID: expectedRpId,
          userVerification: 'required'
        })
        const now = new Date()
        const challenge = await createPasskeyChallenge(db, {
          id: createId(),
          user_id: null,
          flow: 'authentication',
          challenge: options.challenge,
          remember,
          expires_at: new Date(now.getTime() + PASSKEY_CHALLENGE_WINDOW_MS).toISOString(),
          used_at: null,
          created_ip: ctx.ip,
          user_agent: ctx.get('User-Agent') || null,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        })

        ctx.status = 200
        ctx.body = {
          challengeId: challenge.id,
          options
        }
        return
      }

      if (isVerifyAuthenticationRequest) {
        const challengeId = typeof ctx.request.body?.challengeId === 'string' ? ctx.request.body.challengeId.trim() : ''
        const authenticationResponse = ctx.request.body?.authenticationResponse

        await applyPasskeyVerifyAuthenticationRateLimit(app, ctx, challengeId)

        if (!challengeId || !authenticationResponse || typeof authenticationResponse !== 'object') {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [
              !challengeId ? { field: '/challengeId', message: 'must be a non-empty string', params: {} } : null,
              !authenticationResponse || typeof authenticationResponse !== 'object'
                ? { field: '/authenticationResponse', message: 'must be an object', params: {} }
                : null
            ].filter(Boolean)
          })
          return
        }

        const challenge = await getPasskeyChallenge(db, challengeId)
        if (!isPasskeyChallengeUsable(challenge, 'authentication')) {
          throw badRequest('api.passkeys.invalid_authentication_challenge', {}, 'Passkey authentication challenge is invalid')
        }

        const passkey = await getPasskeyByCredentialId(db, authenticationResponse.id)
        if (!passkey) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.credential_not_found', {}, 'Passkey credential not found')
        }

        const user = await db('users').where('id', passkey.user_id).first()
        if (!user) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.invalid_authentication_challenge', {}, 'Passkey authentication challenge is invalid')
        }
        assertUserAccountActive(user)

        let verification
        try {
          verification = await passkeyHelpers.verifyAuthenticationResponse({
            response: authenticationResponse,
            expectedChallenge: challenge.challenge,
            expectedOrigin: expectedOrigins,
            expectedRPID: expectedRpId,
            requireUserVerification: true,
            credential: buildStoredPasskeyCredential(passkey)
          })
        } catch (error) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.authentication_failed', {}, error?.message || 'Passkey authentication failed')
        }

        if (!verification?.verified) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.authentication_failed', {}, 'Passkey authentication failed')
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

        ctx.status = 200
        ctx.body = {
          accessToken: await issueBrowserLoginToken(app, user),
          user: sanitizeUser(user)
        }
        return
      }

      const user = await authenticateRequest(app, ctx)
      if (!user) {
        return
      }

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

        const deletedCount = await deleteUserPasskeys(db, targetUser.id)
        await revokeAllUserRefreshSessions(app, targetUser.id)

        ctx.status = 200
        ctx.body = {
          ok: true,
          user_id: targetUser.id,
          passkey_count: 0,
          deleted_count: deletedCount
        }
        return
      }

      requirePasskeyEligibleMember(user)

      if (isListRequest) {
        ctx.status = 200
        ctx.body = buildPasskeyListResponse(await listUserPasskeys(db, user.id))
        return
      }

      if (isRegistrationOptionsRequest) {
        const currentPasswordError = validateRequiredString(ctx.request.body?.current_password, '/current_password')
        if (currentPasswordError) {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [currentPasswordError]
          })
          return
        }

        await verifyCurrentPassword(app, user, ctx.request.body.current_password)
        const webauthnUserId = await ensureUserWebauthnId(db, user)
        const existingPasskeys = await listUserPasskeys(db, user.id)
        const options = await passkeyHelpers.generateRegistrationOptions({
          rpName: 'Nebulynk',
          rpID: expectedRpId,
          userName: user.email,
          userID: Buffer.from(webauthnUserId, 'base64url'),
          userDisplayName: user.display_name || user.email,
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required'
          },
          excludeCredentials: existingPasskeys.map((passkey) => ({
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
          flow: 'registration',
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
        ctx.body = {
          challengeId: challenge.id,
          options
        }
        return
      }

      if (isVerifyRegistrationRequest) {
        const challengeId = typeof ctx.request.body?.challengeId === 'string' ? ctx.request.body.challengeId.trim() : ''
        const registrationResponse = ctx.request.body?.registrationResponse
        if (!challengeId || !registrationResponse || typeof registrationResponse !== 'object') {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [
              !challengeId ? { field: '/challengeId', message: 'must be a non-empty string', params: {} } : null,
              !registrationResponse || typeof registrationResponse !== 'object'
                ? { field: '/registrationResponse', message: 'must be an object', params: {} }
                : null
            ].filter(Boolean)
          })
          return
        }

        const challenge = await getPasskeyChallenge(db, challengeId)
        if (!isPasskeyChallengeUsable(challenge, 'registration') || challenge.user_id !== user.id) {
          throw badRequest('api.passkeys.invalid_registration_challenge', {}, 'Passkey registration challenge is invalid')
        }

        let verification
        try {
          verification = await passkeyHelpers.verifyRegistrationResponse({
            response: registrationResponse,
            expectedChallenge: challenge.challenge,
            expectedOrigin: expectedOrigins,
            expectedRPID: expectedRpId,
            requireUserVerification: true
          })
        } catch (error) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.registration_failed', {}, error?.message || 'Passkey registration failed')
        }

        if (!verification?.verified || !verification.registrationInfo?.credential) {
          await consumePasskeyChallenge(db, challenge.id)
          throw badRequest('api.passkeys.registration_failed', {}, 'Passkey registration failed')
        }

        const credentialId = verification.registrationInfo.credential.id
        const existingCredential = await getPasskeyByCredentialId(db, credentialId)
        if (existingCredential) {
          await consumePasskeyChallenge(db, challenge.id)
          throw conflict('api.passkeys.credential_already_registered', {}, 'Passkey credential is already registered')
        }

        const nowIso = new Date().toISOString()
        const passkeyId = createId()
        const transports = registrationResponse.response?.transports || []
        const name = normalizePasskeyName(ctx.request.body?.name)
        const createdPasskey = {
          id: passkeyId,
          user_id: user.id,
          credential_id: credentialId,
          public_key: encodeBytesForStorage(verification.registrationInfo.credential.publicKey),
          counter: verification.registrationInfo.credential.counter,
          device_type: verification.registrationInfo.credentialDeviceType,
          backed_up: verification.registrationInfo.credentialBackedUp,
          transports: serializePasskeyTransports(transports),
          name,
          last_used_at: null,
          created_at: nowIso,
          updated_at: nowIso
        }

        await db.transaction(async (trx) => {
          await trx('user_passkeys').insert(createdPasskey)
          await consumePasskeyChallenge(trx, challenge.id, nowIso)
        })

        ctx.status = 200
        ctx.body = {
          passkey: buildPasskeyListResponse([createdPasskey]).passkeys[0]
        }
        return
      }

      if (isDeleteRequest) {
        const currentPasswordError = validateRequiredString(ctx.request.body?.current_password, '/current_password')
        if (currentPasswordError) {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [currentPasswordError]
          })
          return
        }

        await verifyCurrentPassword(app, user, ctx.request.body.current_password)
        const passkeyId = selfDeleteMatch[1]
        const passkey = await getUserPasskeyById(db, user.id, passkeyId)
        if (!passkey) {
          throw notFound('api.passkeys.not_found', {}, 'Passkey not found')
        }

        await db('user_passkeys')
          .where({
            id: passkey.id,
            user_id: user.id
          })
          .del()

        ctx.status = 200
        ctx.body = {
          ok: true
        }
        return
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

      logger.error('Passkey route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        ...buildRequestLogContext(ctx)
      })
      sendError(ctx, 500, 'api.passkeys.unexpected_error', 'Passkey request failed unexpectedly')
    }
  })
}
