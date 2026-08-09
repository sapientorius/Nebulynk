import { createHash, randomBytes } from 'node:crypto'
import { createId } from '@paralleldrive/cuid2'
import { logger } from '../logger.js'
import { assertUserAccountActive } from './account-state.js'
import { assertAccessTokenVersion, buildAuthTokenPayload } from './auth-token-version.js'
import { normalizeMeetingVideoPreferences } from './meeting-video-preferences.js'
import { isProductionEnvironment } from './security-config.js'

const DEFAULT_BROWSER_ACCESS_TOKEN_TTL = '15m'
const DEFAULT_REFRESH_TOKEN_TTL = '1d'
const DEFAULT_REMEMBER_REFRESH_TOKEN_TTL = '30d'
const DEFAULT_REFRESH_COOKIE_NAME = 'nebulynk_refresh_session'
const DEFAULT_CSRF_COOKIE_NAME = 'nebulynk_csrf_token'
const HASH_ALGORITHM = 'sha256'

function normalizeEnvString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseDurationToken(token) {
  const match = /^(\d+)(ms|s|m|h|d)$/i.exec(String(token || '').trim())
  if (!match) return null

  const amount = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const unitMs = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  }[unit]

  return Number.isFinite(amount) && unitMs ? amount * unitMs : null
}

function toIsoTimestamp(value) {
  return new Date(value).toISOString()
}

function hashToken(token) {
  return createHash(HASH_ALGORITHM)
    .update(String(token || ''))
    .digest('hex')
}

function createRandomToken(size = 32) {
  return randomBytes(size).toString('base64url')
}

export function resolveBrowserAccessTokenTtl(env = process.env, authenticationConfig = {}) {
  return normalizeEnvString(env.AUTH_BROWSER_ACCESS_TOKEN_TTL)
    || normalizeEnvString(authenticationConfig?.browserJwtOptions?.expiresIn)
    || DEFAULT_BROWSER_ACCESS_TOKEN_TTL
}

export function resolveRefreshTokenTtl(env = process.env) {
  return normalizeEnvString(env.AUTH_REFRESH_TOKEN_TTL) || DEFAULT_REFRESH_TOKEN_TTL
}

export function resolveRememberRefreshTokenTtl(env = process.env) {
  return normalizeEnvString(env.AUTH_REMEMBER_REFRESH_TOKEN_TTL) || DEFAULT_REMEMBER_REFRESH_TOKEN_TTL
}

export function resolveRefreshCookieName(env = process.env) {
  return normalizeEnvString(env.AUTH_REFRESH_COOKIE_NAME) || DEFAULT_REFRESH_COOKIE_NAME
}

export function resolveCsrfCookieName(env = process.env) {
  return normalizeEnvString(env.AUTH_CSRF_COOKIE_NAME) || DEFAULT_CSRF_COOKIE_NAME
}

export function resolveAuthCookieDomain(env = process.env) {
  return normalizeEnvString(env.AUTH_COOKIE_DOMAIN) || null
}

export function resolveRefreshSessionCookieOptions(env = process.env, { persistent = false, expiresAt = null } = {}) {
  const production = isProductionEnvironment(env)
  const options = {
    httpOnly: true,
    sameSite: production ? 'none' : 'lax',
    secure: production,
    path: '/'
  }

  const cookieDomain = resolveAuthCookieDomain(env)
  if (cookieDomain) {
    options.domain = cookieDomain
  }

  if (persistent && expiresAt) {
    const expiresDate = new Date(expiresAt)
    options.expires = expiresDate
    options.maxAge = Math.max(0, expiresDate.getTime() - Date.now())
  }

  return options
}

export function resolveCsrfCookieOptions(env = process.env, { persistent = false, expiresAt = null } = {}) {
  const options = {
    ...resolveRefreshSessionCookieOptions(env, { persistent, expiresAt }),
    httpOnly: false
  }
  return options
}

function resolveRefreshSessionDurationMs(env = process.env, persistent = false) {
  const configured = persistent
    ? resolveRememberRefreshTokenTtl(env)
    : resolveRefreshTokenTtl(env)
  const durationMs = parseDurationToken(configured)
  if (!durationMs) {
    throw new Error(`Invalid auth refresh duration: ${configured}`)
  }
  return durationMs
}

export function issueBrowserAccessTokenJwtOptions(app) {
  const authenticationConfig = app.get('authentication') || {}
  return {
    expiresIn: resolveBrowserAccessTokenTtl(process.env, authenticationConfig)
  }
}

export function sanitizeUser(user) {
  if (!user || typeof user !== 'object') return null
  const sanitized = { ...user }
  delete sanitized.password
  delete sanitized.avatar_storage_key
  delete sanitized.webauthn_user_id
  delete sanitized.auth_version
  sanitized.meeting_video_preferences = normalizeMeetingVideoPreferences(sanitized.meeting_video_preferences)
  return sanitized
}

export async function resolveUserFromAccessToken(app, accessToken) {
  const payload = await app.service('authentication').verifyAccessToken(accessToken)
  const userId = typeof payload?.sub === 'string' ? payload.sub : null
  if (!userId) {
    throw new Error('Access token payload is missing subject')
  }

  const db = app.get('postgresqlClient')
  const user = await db('users').where('id', userId).first()
  if (!user) {
    throw new Error('User not found')
  }

  assertAccessTokenVersion(payload, user)
  assertUserAccountActive(user)
  return sanitizeUser(user)
}

async function issueAccessTokenForUser(app, user, { transport = 'body' } = {}) {
  const authService = app.service('authentication')
  const jwtOptions = transport === 'cookie'
    ? issueBrowserAccessTokenJwtOptions(app)
    : {}
  return authService.createAccessToken(buildAuthTokenPayload(user), {
    subject: `${user.id}`,
    ...jwtOptions
  })
}

function buildSessionSummary(session) {
  return {
    id: session.id,
    transport: session.transport,
    expires_at: session.expires_at,
    is_persistent: Boolean(session.is_persistent),
    last_used_at: session.last_used_at || null
  }
}

export function readSessionCookies(ctx, env = process.env) {
  const candidates = readSessionCookieCandidates(ctx, env)
  return {
    refreshToken: candidates.refreshTokens.at(-1) || null,
    csrfToken: candidates.csrfTokens.at(-1) || null
  }
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readCookieCandidates(ctx, cookieName) {
  const cookieHeader = ctx.get('Cookie') || ''
  if (!cookieHeader || !cookieName) return []

  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=')
      const key = separatorIndex === -1 ? entry : entry.slice(0, separatorIndex)
      const value = separatorIndex === -1 ? '' : entry.slice(separatorIndex + 1)
      return { key, value }
    })
    .filter((entry) => entry.key === cookieName)
    .map((entry) => decodeCookieValue(entry.value))
    .filter(Boolean)
}

export function readSessionCookieCandidates(ctx, env = process.env) {
  return {
    refreshTokens: readCookieCandidates(ctx, resolveRefreshCookieName(env)),
    csrfTokens: readCookieCandidates(ctx, resolveCsrfCookieName(env))
  }
}

export function setSessionCookies(ctx, env = process.env, {
  refreshToken,
  csrfToken,
  persistent = false,
  expiresAt = null
}) {
  ctx.cookies.set(
    resolveRefreshCookieName(env),
    refreshToken,
    resolveRefreshSessionCookieOptions(env, { persistent, expiresAt })
  )
  ctx.cookies.set(
    resolveCsrfCookieName(env),
    csrfToken,
    resolveCsrfCookieOptions(env, { persistent, expiresAt })
  )
}

export function clearSessionCookies(ctx, env = process.env) {
  ctx.cookies.set(resolveRefreshCookieName(env), '', {
    ...resolveRefreshSessionCookieOptions(env),
    maxAge: 0
  })
  ctx.cookies.set(resolveCsrfCookieName(env), '', {
    ...resolveCsrfCookieOptions(env),
    maxAge: 0
  })
}

export function validateCsrfToken(ctx, env = process.env) {
  const requestToken = ctx.get('X-CSRF-Token')
  const cookieToken = ctx.cookies.get(resolveCsrfCookieName(env))
  return Boolean(requestToken && cookieToken && requestToken === cookieToken)
}

export async function createRefreshSession(app, {
  user,
  transport = 'body',
  remember = false,
  createdIp = null,
  userAgent = null
}) {
  const db = app.get('postgresqlClient')
  const refreshToken = createRandomToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + resolveRefreshSessionDurationMs(process.env, remember))
  const session = {
    id: createId(),
    user_id: user.id,
    refresh_token_hash: hashToken(refreshToken),
    transport,
    is_persistent: Boolean(remember),
    expires_at: expiresAt.toISOString(),
    last_used_at: null,
    revoked_at: null,
    created_ip: createdIp,
    last_used_ip: createdIp,
    user_agent: userAgent || null,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  }

  await db('auth_sessions').insert(session)

  return {
    refreshToken,
    session: buildSessionSummary(session)
  }
}

async function findActiveSessionByRefreshToken(app, refreshToken) {
  const db = app.get('postgresqlClient')
  const tokenHash = hashToken(refreshToken)
  return db('auth_sessions')
    .where('refresh_token_hash', tokenHash)
    .whereNull('revoked_at')
    .first()
}

function ensureSessionUsable(session) {
  if (!session) {
    const error = new Error('Refresh session not found')
    error.statusCode = 401
    error.errorCode = 'api.auth_session.invalid_refresh_token'
    throw error
  }

  const expiresAtMs = Date.parse(session.expires_at)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const error = new Error('Refresh session expired')
    error.statusCode = 401
    error.errorCode = 'api.auth_session.refresh_session_expired'
    throw error
  }
}

export async function refreshSession(app, {
  refreshToken,
  transport = 'body',
  lastUsedIp = null,
  userAgent = null
}) {
  const db = app.get('postgresqlClient')
  const session = await findActiveSessionByRefreshToken(app, refreshToken)
  ensureSessionUsable(session)

  const user = await db('users').where('id', session.user_id).first()
  if (!user) {
    const error = new Error('User not found')
    error.statusCode = 401
    error.errorCode = 'api.auth_session.invalid_refresh_token'
    throw error
  }

  assertUserAccountActive(user)

  const nextRefreshToken = createRandomToken()
  const nextUpdatedAt = new Date().toISOString()
  await db('auth_sessions')
    .where('id', session.id)
    .update({
      refresh_token_hash: hashToken(nextRefreshToken),
      last_used_at: nextUpdatedAt,
      last_used_ip: lastUsedIp || session.last_used_ip || null,
      user_agent: userAgent || session.user_agent || null,
      updated_at: nextUpdatedAt
    })

  const accessToken = await issueAccessTokenForUser(app, user, {
    transport: session.transport
  })

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    user: sanitizeUser(user),
    session: buildSessionSummary({
      ...session,
      last_used_at: nextUpdatedAt,
      last_used_ip: lastUsedIp || session.last_used_ip || null,
      user_agent: userAgent || session.user_agent || null,
      updated_at: nextUpdatedAt
    })
  }
}

export async function revokeRefreshSession(app, refreshToken) {
  if (!refreshToken) return false

  const db = app.get('postgresqlClient')
  const session = await findActiveSessionByRefreshToken(app, refreshToken)
  if (!session) return false

  const nowIso = new Date().toISOString()
  await db('auth_sessions')
    .where('id', session.id)
    .update({
      revoked_at: nowIso,
      updated_at: nowIso
    })
  return true
}

export async function revokeAllUserRefreshSessions(app, userId) {
  const db = app.get('postgresqlClient')
  const nowIso = new Date().toISOString()
  try {
    await db('auth_sessions')
      .where('user_id', userId)
      .whereNull('revoked_at')
      .update({
        revoked_at: nowIso,
        updated_at: nowIso
      })
  } catch (error) {
    logger.warn('Failed to revoke refresh sessions for user', {
      userId,
      error: error.message
    })
  }
}
