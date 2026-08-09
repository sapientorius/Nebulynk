import { createId } from '@paralleldrive/cuid2'
import { buildErrorBody, attachErrorMetadata } from '../lib/errors.js'
import { logger } from '../logger.js'
import { assertUserAccountActive } from '../lib/account-state.js'
import { buildAuthTokenPayload } from '../lib/auth-token-version.js'
import { issueBrowserAccessTokenJwtOptions, sanitizeUser } from '../lib/auth-sessions.js'
import { consumeRateLimitBuckets, getRequestIp } from '../hooks/rate-limit.js'
import {
  createLoginChallenge,
  getActiveTwoFactor,
  getLoginChallenge,
  consumeLoginChallenge,
  updateLoginChallengeFailure
} from '../lib/two-factor-data.js'
import { decryptTwoFactorSecret } from '../lib/two-factor-secrets.js'
import {
  LOGIN_CHALLENGE_MAX_ATTEMPTS,
  LOGIN_CHALLENGE_WINDOW_MS,
  hashRecoveryCode,
  maskUserHint,
  normalizeRecoveryCode,
  verifyTotpCode
} from '../lib/two-factor.js'

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

function isNotAuthenticatedError(error) {
  return error?.name === 'NotAuthenticated' || error?.className === 'not-authenticated'
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeChallengeMethod(value) {
  return value === 'recovery_code' ? 'recovery_code' : 'totp'
}

function normalizeChallengeCode(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildChallengeResponse(challenge, user) {
  return {
    requiresTwoFactor: true,
    challengeId: challenge.id,
    expiresAt: challenge.expires_at,
    remember: challenge.remember,
    availableMethods: ['totp', 'recovery_code'],
    userHint: maskUserHint(user?.email)
  }
}

function isChallengeUsable(challenge) {
  if (!challenge || challenge.consumed_at) {
    return false
  }

  if (typeof challenge.attempt_count === 'number' && challenge.attempt_count >= LOGIN_CHALLENGE_MAX_ATTEMPTS) {
    return false
  }

  const expiresAtMs = Date.parse(challenge.expires_at)
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()
}

async function issueBrowserLoginToken(app, user) {
  return app.service('authentication').createAccessToken(buildAuthTokenPayload(user), {
    subject: `${user.id}`,
    ...issueBrowserAccessTokenJwtOptions(app)
  })
}

function buildInvalidCredentialsError() {
  const error = new Error('Invalid credentials')
  error.statusCode = 401
  error.errorCode = 'api.authentication.invalid_credentials'
  error.data = {
    error_code: 'api.authentication.invalid_credentials',
    error_params: {}
  }
  return error
}

async function applyTwoFactorVerifyRateLimit(app, ctx, challengeId) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.authentication.rate_limited',
    buckets: [
      {
        name: 'auth-login-verify-2fa:ip',
        key: getRequestIp({
          headers: ctx.headers,
          ip: ctx.ip
        }),
        limit: 30
      },
      {
        name: 'auth-login-verify-2fa:challenge',
        key: challengeId,
        limit: 5
      }
    ]
  })
}

export function configureAuthLoginRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const isLoginRequest = ctx.path === '/auth/login' && ctx.method === 'POST'
    const isVerifyRequest = ctx.path === '/auth/login/verify-2fa' && ctx.method === 'POST'

    if (!isLoginRequest && !isVerifyRequest) {
      return next()
    }

    const db = app.get('postgresqlClient')

    try {
      if (isLoginRequest) {
        const email = normalizeEmail(ctx.request.body?.email)
        const password = typeof ctx.request.body?.password === 'string' ? ctx.request.body.password : ''
        const remember = ctx.request.body?.remember === true

        if (!email || !password) {
          sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
            errors: [
              !email ? { field: '/email', message: 'must be a non-empty string', params: {} } : null,
              !password ? { field: '/password', message: 'must be a non-empty string', params: {} } : null
            ].filter(Boolean)
          })
          return
        }

        let authResult
        try {
          authResult = await app.service('authentication').create({
            strategy: 'local',
            email,
            password,
            remember,
            session_mode: 'browser'
          }, {
            provider: 'rest',
            headers: ctx.headers,
            ip: ctx.ip
          })
        } catch (error) {
          if (isNotAuthenticatedError(error)) {
            throw buildInvalidCredentialsError()
          }
          throw error
        }

        const twoFactor = await getActiveTwoFactor(db, authResult.user?.id)
        if (!twoFactor || authResult.user?.account_type === 'guest') {
          ctx.status = 200
          ctx.body = {
            accessToken: authResult.accessToken,
            user: sanitizeUser(authResult.user)
          }
          return
        }

        const now = new Date()
        const challenge = await createLoginChallenge(db, {
          id: createId(),
          user_id: authResult.user.id,
          remember,
          expires_at: new Date(now.getTime() + LOGIN_CHALLENGE_WINDOW_MS).toISOString(),
          attempt_count: 0,
          consumed_at: null,
          created_ip: ctx.ip,
          user_agent: ctx.get('User-Agent') || null,
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        })

        ctx.status = 200
        ctx.body = buildChallengeResponse(challenge, authResult.user)
        return
      }

      const challengeId = typeof ctx.request.body?.challengeId === 'string' ? ctx.request.body.challengeId.trim() : ''
      const method = normalizeChallengeMethod(ctx.request.body?.method)
      const code = normalizeChallengeCode(ctx.request.body?.code)

      await applyTwoFactorVerifyRateLimit(app, ctx, challengeId)

      if (!challengeId || !code) {
        sendError(ctx, 400, 'api.validation.failed', 'Validierungsfehler', {
          errors: [
            !challengeId ? { field: '/challengeId', message: 'must be a non-empty string', params: {} } : null,
            !code ? { field: '/code', message: 'must be a non-empty string', params: {} } : null
          ].filter(Boolean)
        })
        return
      }

      const challenge = await getLoginChallenge(db, challengeId)
      if (!isChallengeUsable(challenge)) {
        sendError(ctx, 400, 'api.two_factor.invalid_login_challenge', '2FA login challenge is invalid')
        return
      }

      const user = await db('users').where('id', challenge.user_id).first()
      const twoFactor = await getActiveTwoFactor(db, challenge.user_id)
      if (!user || !twoFactor) {
        await consumeLoginChallenge(db, challenge.id)
        sendError(ctx, 400, 'api.two_factor.invalid_login_challenge', '2FA login challenge is invalid')
        return
      }
      assertUserAccountActive(user)

      const nowIso = new Date().toISOString()
      let verified = false

      if (method === 'totp') {
        const secret = decryptTwoFactorSecret(app, twoFactor.encrypted_secret)
        verified = verifyTotpCode(secret, code)
      } else {
        const normalizedRecoveryCode = normalizeRecoveryCode(code)
        if (normalizedRecoveryCode) {
          const recoveryCode = await db('user_two_factor_recovery_codes')
            .where({
              user_id: challenge.user_id,
              code_hash: hashRecoveryCode(normalizedRecoveryCode)
            })
            .whereNull('used_at')
            .first()

          if (recoveryCode) {
            await db('user_two_factor_recovery_codes')
              .where('id', recoveryCode.id)
              .update({
                used_at: nowIso
              })
            verified = true
          }
        }
      }

      if (!verified) {
        const nextAttemptCount = (challenge.attempt_count || 0) + 1
        await updateLoginChallengeFailure(db, challenge.id, {
          attemptCount: nextAttemptCount,
          consumedAt: nextAttemptCount >= LOGIN_CHALLENGE_MAX_ATTEMPTS ? nowIso : null,
          updatedAt: nowIso
        })
        sendError(ctx, 400, 'api.two_factor.invalid_code', 'A valid authentication code is required')
        return
      }

      await db('user_two_factor')
        .where('user_id', challenge.user_id)
        .update({
          last_used_at: nowIso,
          updated_at: nowIso
        })
      await consumeLoginChallenge(db, challenge.id, nowIso)

      ctx.status = 200
      ctx.body = {
        accessToken: await issueBrowserLoginToken(app, user),
        user: sanitizeUser(user)
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

      logger.error('Auth login route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        ...buildRequestLogContext(ctx)
      })
      sendError(ctx, 500, 'api.auth_login.unexpected_error', 'Login failed unexpectedly')
    }
  })
}
