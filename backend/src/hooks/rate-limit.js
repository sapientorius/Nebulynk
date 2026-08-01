import { tooManyRequests } from '../lib/errors.js'

const TEN_MINUTES_MS = 10 * 60 * 1000
const DEFAULT_AUTHENTICATION_IP_LIMIT = 20
const DEFAULT_NON_PRODUCTION_AUTHENTICATION_IP_LIMIT = 100

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getRequestIp(params = {}) {
  const headers = params.headers && typeof params.headers === 'object'
    ? params.headers
    : {}

  const forwardedFor = normalizeValue(headers['x-forwarded-for'])
  if (forwardedFor) {
    const [first] = forwardedFor.split(',')
    const forwardedIp = normalizeValue(first)
    if (forwardedIp) return forwardedIp
  }

  const realIp = normalizeValue(headers['x-real-ip'])
  if (realIp) return realIp

  const paramsIp = normalizeValue(params.ip)
  if (paramsIp) return paramsIp

  return 'unknown'
}

export function normalizeEmailRateLimitKey(value) {
  return normalizeValue(value).toLowerCase()
}

export function normalizeTokenRateLimitKey(value) {
  return normalizeValue(value)
}

function getRateLimiter(app) {
  return app?.get?.('rateLimiter') || null
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(normalizeValue(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isProductionEnvironment(env = process.env) {
  return normalizeValue(env.NODE_ENV).toLowerCase() === 'production'
}

export function resolveAuthenticationIpRateLimit(env = process.env) {
  return parsePositiveInteger(env.AUTHENTICATION_RATE_LIMIT_IP_LIMIT)
    || (isProductionEnvironment(env)
      ? DEFAULT_AUTHENTICATION_IP_LIMIT
      : DEFAULT_NON_PRODUCTION_AUTHENTICATION_IP_LIMIT)
}

function buildRateLimitError(errorCode, retryAfterSeconds) {
  return tooManyRequests(
    errorCode,
    { retry_after_seconds: retryAfterSeconds },
    'Too many requests'
  )
}

export async function consumeRateLimitBuckets(app, {
  errorCode,
  buckets
}) {
  const rateLimiter = getRateLimiter(app)
  if (!rateLimiter) return

  for (const bucket of buckets) {
    const key = bucket.key
    if (!key) continue

    const result = await rateLimiter.consume({
      bucket: bucket.name,
      key,
      limit: bucket.limit,
      windowMs: bucket.windowMs || TEN_MINUTES_MS
    })

    if (!result.allowed) {
      throw buildRateLimitError(errorCode, result.retryAfterSeconds)
    }
  }
}

export function createRateLimitHook({
  errorCode,
  buckets
}) {
  return async (context) => {
    if (!context.params?.provider) return context

    await consumeRateLimitBuckets(context.app, {
      errorCode,
      buckets: buckets.map((bucket) => ({
        ...bucket,
        key: bucket.deriveKey(context)
      }))
    })

    return context
  }
}

export function createAuthenticationRateLimitHook({ env = process.env } = {}) {
  const baseHook = createRateLimitHook({
    errorCode: 'api.authentication.rate_limited',
    buckets: [
      {
        name: 'authentication:ip',
        limit: resolveAuthenticationIpRateLimit(env),
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'authentication:email',
        limit: 5,
        deriveKey: (context) => normalizeEmailRateLimitKey(context.data?.email)
      }
    ]
  })

  return async (context) => {
    if (normalizeValue(context.data?.strategy).toLowerCase() !== 'local') {
      return context
    }

    return baseHook(context)
  }
}

export async function clearAuthenticationRateLimitHook(context) {
  if (!context.params?.provider) return context
  if (normalizeValue(context.data?.strategy).toLowerCase() !== 'local') return context

  const rateLimiter = getRateLimiter(context.app)
  if (!rateLimiter) return context

  const emailKey = normalizeEmailRateLimitKey(context.data?.email)
  if (!emailKey) return context

  await rateLimiter.reset({
    bucket: 'authentication:email',
    key: emailKey
  })

  return context
}

export function createInviteAcceptFindRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.invite_accept.rate_limited',
    buckets: [
      {
        name: 'invite-accept:find:ip',
        limit: 30,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'invite-accept:find:token',
        limit: 10,
        deriveKey: (context) => normalizeTokenRateLimitKey(context.params?.query?.token)
      }
    ]
  })
}

export function createInviteAcceptCreateRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.invite_accept.rate_limited',
    buckets: [
      {
        name: 'invite-accept:create:ip',
        limit: 10,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'invite-accept:create:token',
        limit: 5,
        deriveKey: (context) => normalizeTokenRateLimitKey(context.data?.token)
      }
    ]
  })
}

export function createMeetingInviteFindRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.meeting_invite.rate_limited',
    buckets: [
      {
        name: 'meeting-invite:find:ip',
        limit: 60,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'meeting-invite:find:token',
        limit: 30,
        deriveKey: (context) => normalizeTokenRateLimitKey(context.params?.query?.token)
      }
    ]
  })
}

export function createMeetingInviteCreateRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.meeting_invite.rate_limited',
    buckets: [
      {
        name: 'meeting-invite:create:ip',
        limit: 12,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'meeting-invite:create:token',
        limit: 25,
        deriveKey: (context) => normalizeTokenRateLimitKey(context.data?.token)
      }
    ]
  })
}

export function createPasswordResetRequestRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.password_reset.rate_limited',
    buckets: [
      {
        name: 'password-reset:request:ip',
        limit: 10,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'password-reset:request:email',
        limit: 5,
        deriveKey: (context) => normalizeEmailRateLimitKey(context.data?.email)
      }
    ]
  })
}

export function createPasswordResetTokenRateLimitHook() {
  return createRateLimitHook({
    errorCode: 'api.password_reset.rate_limited',
    buckets: [
      {
        name: 'password-reset:token:ip',
        limit: 20,
        deriveKey: (context) => getRequestIp(context.params)
      },
      {
        name: 'password-reset:token:value',
        limit: 10,
        deriveKey: (context) => normalizeTokenRateLimitKey(
          context.params?.query?.token || context.id
        )
      }
    ]
  })
}
