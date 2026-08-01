import { buildErrorBody } from '../lib/errors.js'
import { logger } from '../logger.js'
import {
  clearSessionCookies,
  createRefreshSession,
  readSessionCookieCandidates,
  readSessionCookies,
  refreshSession,
  resolveCsrfCookieName,
  resolveCsrfCookieOptions,
  resolveRefreshCookieName,
  resolveRefreshSessionCookieOptions,
  resolveUserFromAccessToken,
  revokeRefreshSession,
  setSessionCookies
} from '../lib/auth-sessions.js'

const AUTH_SESSION_DEBUG_HEADER = 'X-Auth-Session-Debug-Id'

function getBearerToken(ctx) {
  const authHeader = ctx.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.slice('Bearer '.length).trim() || null
}

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function buildRequestLogContext(ctx) {
  return {
    path: ctx.path,
    method: ctx.method,
    ip: ctx.ip,
    userAgent: ctx.get('User-Agent') || null,
    origin: ctx.get('Origin') || null,
    referer: ctx.get('Referer') || null,
    authSessionDebugId: ctx.get(AUTH_SESSION_DEBUG_HEADER) || null
  }
}

function sanitizeCookieOptions(options = {}) {
  return {
    sameSite: options.sameSite || null,
    secure: options.secure === true,
    httpOnly: options.httpOnly === true,
    domain: options.domain || null,
    path: options.path || null,
    persistent: Boolean(options.expires),
    hasMaxAge: typeof options.maxAge === 'number'
  }
}

function buildCookieLogContext({ persistent = false, expiresAt = null } = {}) {
  return {
    refreshCookieName: resolveRefreshCookieName(process.env),
    csrfCookieName: resolveCsrfCookieName(process.env),
    refreshCookie: sanitizeCookieOptions(resolveRefreshSessionCookieOptions(process.env, {
      persistent,
      expiresAt
    })),
    csrfCookie: sanitizeCookieOptions(resolveCsrfCookieOptions(process.env, {
      persistent,
      expiresAt
    }))
  }
}

function buildRefreshInputLogContext(ctx, cookieState = readSessionCookies(ctx)) {
  const cookieCandidates = readSessionCookieCandidates(ctx)
  return {
    bodyRefreshTokenPresent: Boolean(
      typeof ctx.request.body?.refreshToken === 'string' && ctx.request.body.refreshToken.trim()
    ),
    headerRefreshTokenPresent: Boolean(ctx.get('X-Refresh-Token')),
    refreshCookiePresent: Boolean(cookieState.refreshToken),
    csrfCookiePresent: Boolean(cookieState.csrfToken),
    csrfHeaderPresent: Boolean(ctx.get('X-CSRF-Token')),
    refreshCookieCandidateCount: cookieCandidates.refreshTokens.length,
    csrfCookieCandidateCount: cookieCandidates.csrfTokens.length
  }
}

function buildCsrfValidationContext(ctx, cookieState = readSessionCookies(ctx)) {
  const requestToken = ctx.get('X-CSRF-Token')
  const csrfTokens = readSessionCookieCandidates(ctx).csrfTokens
  return {
    csrfHeaderPresent: Boolean(requestToken),
    csrfCookiePresent: Boolean(cookieState.csrfToken),
    csrfMatches: Boolean(requestToken && csrfTokens.includes(requestToken))
  }
}

function logAuthSessionInfo(message, ctx, details = {}) {
  logger.info(message, {
    ...buildRequestLogContext(ctx),
    ...details
  })
}

function logAuthSessionWarn(message, ctx, details = {}) {
  logger.warn(message, {
    ...buildRequestLogContext(ctx),
    ...details
  })
}

function resolveBootstrapTransport(body = {}) {
  return body?.transport === 'cookie' ? 'cookie' : 'body'
}

function getBodyRefreshToken(ctx) {
  if (typeof ctx.request.body?.refreshToken === 'string' && ctx.request.body.refreshToken.trim()) {
    return ctx.request.body.refreshToken.trim()
  }

  const headerRefreshToken = ctx.get('X-Refresh-Token')
  return typeof headerRefreshToken === 'string' && headerRefreshToken.trim()
    ? headerRefreshToken.trim()
    : ''
}

function resolveRequestTransport(ctx) {
  if (getBodyRefreshToken(ctx)) {
    return 'body'
  }

  return readSessionCookies(ctx).refreshToken ? 'cookie' : 'body'
}

async function refreshSessionFromRequest(app, ctx, {
  transport,
  bodyRefreshToken,
  cookieState
}) {
  const refreshTokens = transport === 'cookie'
    ? [...new Set(readSessionCookieCandidates(ctx).refreshTokens)]
    : [bodyRefreshToken]
  let lastRefreshError = null

  for (const refreshToken of refreshTokens) {
    try {
      return await refreshSession(app, {
        refreshToken,
        transport,
        lastUsedIp: ctx.ip,
        userAgent: ctx.get('User-Agent')
      })
    } catch (error) {
      if (transport !== 'cookie' || error?.errorCode !== 'api.auth_session.invalid_refresh_token') {
        throw error
      }
      lastRefreshError = error
    }
  }

  if (lastRefreshError) {
    throw lastRefreshError
  }

  return refreshSession(app, {
    refreshToken: transport === 'cookie' ? cookieState.refreshToken : bodyRefreshToken,
    transport,
    lastUsedIp: ctx.ip,
    userAgent: ctx.get('User-Agent')
  })
}

export function configureAuthSessionRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const isBootstrapRequest = ctx.path === '/auth/session/bootstrap' && ctx.method === 'POST'
    const isRefreshRequest = ctx.path === '/auth/session/refresh' && ctx.method === 'POST'
    const isDeleteRequest = ctx.path === '/auth/session' && ctx.method === 'DELETE'

    if (!isBootstrapRequest && !isRefreshRequest && !isDeleteRequest) {
      return next()
    }

    try {
      if (isBootstrapRequest) {
        const accessToken = getBearerToken(ctx)
        if (!accessToken) {
          sendError(ctx, 401, 'api.auth_session.authentication_required', 'Authentication required')
          return
        }

        const transport = resolveBootstrapTransport(ctx.request.body || {})
        const remember = ctx.request.body?.remember === true
        const user = await resolveUserFromAccessToken(app, accessToken)
        const result = await createRefreshSession(app, {
          user,
          transport,
          remember,
          createdIp: ctx.ip,
          userAgent: ctx.get('User-Agent')
        })
        const csrfToken = result.refreshToken.slice(0, 24)

        if (transport === 'cookie') {
          setSessionCookies(ctx, process.env, {
            refreshToken: result.refreshToken,
            csrfToken,
            persistent: result.session.is_persistent,
            expiresAt: result.session.expires_at
          })

          logAuthSessionInfo('Auth session bootstrap succeeded', ctx, {
            transport,
            remember,
            userId: user.id,
            sessionId: result.session.id,
            ...buildCookieLogContext({
              persistent: result.session.is_persistent,
              expiresAt: result.session.expires_at
            })
          })

          ctx.status = 200
          ctx.body = {
            csrfToken,
            user,
            session: result.session
          }
          return
        }

        logAuthSessionInfo('Auth session bootstrap succeeded', ctx, {
          transport,
          remember,
          userId: user.id,
          sessionId: result.session.id
        })

        ctx.status = 200
        ctx.body = {
          user,
          refreshToken: result.refreshToken,
          session: result.session
        }
        return
      }

      if (isRefreshRequest) {
        const transport = resolveRequestTransport(ctx)
        const bodyRefreshToken = getBodyRefreshToken(ctx)
        const cookieState = readSessionCookies(ctx)
        const refreshToken = transport === 'cookie' ? cookieState.refreshToken : bodyRefreshToken

        if (!refreshToken) {
          logAuthSessionWarn('Auth session refresh missing refresh token', ctx, {
            transport,
            ...buildRefreshInputLogContext(ctx, cookieState),
            ...buildCookieLogContext()
          })
          clearSessionCookies(ctx, process.env)
          sendError(ctx, 401, 'api.auth_session.invalid_refresh_token', 'Invalid refresh token')
          return
        }

        const csrfValidation = buildCsrfValidationContext(ctx, cookieState)
        if (transport === 'cookie' && !csrfValidation.csrfMatches) {
          logAuthSessionWarn('Auth session refresh CSRF validation failed', ctx, {
            transport,
            ...buildRefreshInputLogContext(ctx, cookieState),
            ...csrfValidation,
            ...buildCookieLogContext()
          })
          clearSessionCookies(ctx, process.env)
          sendError(ctx, 403, 'api.auth_session.invalid_csrf_token', 'Invalid CSRF token')
          return
        }

        const result = await refreshSessionFromRequest(app, ctx, {
          transport,
          bodyRefreshToken,
          cookieState
        })
        const csrfToken = result.refreshToken.slice(0, 24)

        if (transport === 'cookie') {
          setSessionCookies(ctx, process.env, {
            refreshToken: result.refreshToken,
            csrfToken,
            persistent: result.session.is_persistent,
            expiresAt: result.session.expires_at
          })
          logAuthSessionInfo('Auth session refresh succeeded', ctx, {
            transport,
            userId: result.user.id,
            sessionId: result.session.id,
            ...buildRefreshInputLogContext(ctx, cookieState),
            ...buildCookieLogContext({
              persistent: result.session.is_persistent,
              expiresAt: result.session.expires_at
            })
          })
          ctx.status = 200
          ctx.body = {
            accessToken: result.accessToken,
            csrfToken,
            user: result.user,
            session: result.session
          }
          return
        }

        logAuthSessionInfo('Auth session refresh succeeded', ctx, {
          transport,
          userId: result.user.id,
          sessionId: result.session.id,
          ...buildRefreshInputLogContext(ctx, cookieState)
        })

        ctx.status = 200
        ctx.body = result
        return
      }

      const transport = resolveRequestTransport(ctx)
      const bodyRefreshToken = getBodyRefreshToken(ctx)
      const cookieState = readSessionCookies(ctx)
      const refreshToken = transport === 'cookie' ? cookieState.refreshToken : bodyRefreshToken

      const csrfValidation = buildCsrfValidationContext(ctx, cookieState)
      if (transport === 'cookie' && !csrfValidation.csrfMatches) {
        clearSessionCookies(ctx, process.env)
        sendError(ctx, 403, 'api.auth_session.invalid_csrf_token', 'Invalid CSRF token')
        return
      }

      await revokeRefreshSession(app, refreshToken)
      clearSessionCookies(ctx, process.env)
      ctx.status = 204
      return
    } catch (error) {
      if (error?.statusCode && error?.errorCode) {
        if (ctx.path === '/auth/session/refresh') {
          logAuthSessionWarn('Auth session refresh rejected', ctx, {
            transport: resolveRequestTransport(ctx),
            errorCode: error.errorCode,
            statusCode: error.statusCode,
            ...buildRefreshInputLogContext(ctx),
            ...buildCookieLogContext()
          })
          clearSessionCookies(ctx, process.env)
        }
        sendError(ctx, error.statusCode, error.errorCode, error.message)
        return
      }

      logger.error('Auth session route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        ...buildRequestLogContext(ctx)
      })
      sendError(ctx, 500, 'api.auth_session.unexpected_error', 'Session handling failed')
    }
  })
}
