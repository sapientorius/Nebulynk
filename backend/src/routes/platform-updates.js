import { authenticateRequest } from './authenticate-request.js'
import { attachErrorMetadata, badRequest, buildErrorBody, conflict, forbidden } from '../lib/errors.js'
import { consumeRateLimitBuckets, getRequestIp } from '../hooks/rate-limit.js'
import { createSensitivePasskeyOptions, verifySensitiveReauth } from '../lib/sensitive-reauth.js'
import { logger } from '../logger.js'

const DISABLE_CONFIRMATION = 'DISABLE_UPDATE_CHECKS'
const PASSKEY_FLOW = 'platform-update-settings'

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function requireSystemAdmin(user) {
  if (user?.is_admin !== true) {
    throw forbidden('api.platform_updates.admin_required', {}, 'Only platform administrators can access update information')
  }
}

function requirePrimaryAdmin(user) {
  if (user?.is_primary_admin !== true) {
    throw forbidden('api.platform_updates.primary_admin_required', {}, 'Only the platform owner can manage update checks')
  }
}

async function applyRateLimit(app, ctx, userId, operation, limit) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.platform_updates.rate_limited',
    buckets: [
      { name: `platform-updates:${operation}:ip`, key: getRequestIp({ headers: ctx.headers, ip: ctx.ip }), limit: limit * 2 },
      { name: `platform-updates:${operation}:user`, key: userId, limit }
    ]
  })
}

function normalizeAcknowledgementVersions(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw badRequest('api.platform_updates.versions_required', {}, 'versions must be a non-empty array')
  }
  const versions = [...new Set(value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean))]
  if (versions.length !== value.length) {
    throw badRequest('api.platform_updates.versions_invalid', {}, 'versions contains invalid or duplicate entries')
  }
  return versions
}

export function configurePlatformUpdateRoutes(app) {
  app.use(async (ctx, next) => {
    const isStatus = ctx.path === '/platform-updates' && ctx.method === 'GET'
    const isCheck = ctx.path === '/platform-updates/check' && ctx.method === 'POST'
    const isAcknowledge = ctx.path === '/platform-updates/acknowledgements' && ctx.method === 'POST'
    const isSettings = ctx.path === '/platform-updates/settings' && ctx.method === 'PATCH'
    const isPasskeyOptions = ctx.path === '/platform-updates/settings/passkey-options' && ctx.method === 'POST'
    if (!isStatus && !isCheck && !isAcknowledge && !isSettings && !isPasskeyOptions) return next()

    try {
      const user = await authenticateRequest(app, ctx)
      if (!user) return
      requireSystemAdmin(user)
      const manager = app.get('platformUpdateManager')
      if (!manager) throw conflict('api.platform_updates.unavailable', {}, 'Platform update service is not available')

      if (isStatus) {
        ctx.status = 200
        ctx.body = await manager.getStatus(user)
        return
      }
      if (isCheck) {
        await applyRateLimit(app, ctx, user.id, 'check', 10)
        await manager.check({ force: true, throwIfDisabled: true })
        ctx.status = 200
        ctx.body = await manager.getStatus(user)
        return
      }
      if (isAcknowledge) {
        await applyRateLimit(app, ctx, user.id, 'acknowledge', 60)
        ctx.status = 200
        ctx.body = await manager.acknowledge(user, normalizeAcknowledgementVersions(ctx.request.body?.versions))
        return
      }

      requirePrimaryAdmin(user)
      await applyRateLimit(app, ctx, user.id, 'settings', 10)
      const db = app.get('postgresqlClient')
      if (isPasskeyOptions) {
        ctx.status = 200
        ctx.body = await createSensitivePasskeyOptions(app, db, user, {
          flow: PASSKEY_FLOW,
          ip: ctx.ip,
          userAgent: ctx.get('User-Agent') || null
        })
        return
      }

      const enabled = ctx.request.body?.checks_enabled
      if (typeof enabled !== 'boolean') {
        throw badRequest('api.platform_updates.enabled_required', {}, 'checks_enabled must be boolean')
      }
      if (!enabled) {
        if (ctx.request.body?.confirmation !== DISABLE_CONFIRMATION) {
          throw badRequest('api.platform_updates.confirmation_required', {}, 'Update check disable confirmation is required')
        }
        await verifySensitiveReauth(app, db, user, ctx.request.body?.reauth, { flow: PASSKEY_FLOW })
      }
      ctx.status = 200
      ctx.body = await manager.setChecksEnabled(user, enabled)
    } catch (error) {
      if (error?.code === 'platform_update_checks_disabled') {
        const normalized = attachErrorMetadata(conflict('api.platform_updates.checks_disabled', {}, 'Update checks are disabled'))
        sendError(ctx, normalized.statusCode || 409, normalized.error_code, normalized.message)
        return
      }
      if (error?.code === 'platform_update_release_not_outstanding') {
        const normalized = attachErrorMetadata(badRequest(
          'api.platform_updates.release_not_outstanding',
          {},
          'One or more releases are not outstanding for the installed version'
        ))
        sendError(ctx, normalized.statusCode || 400, normalized.error_code, normalized.message)
        return
      }
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
      logger.error('Platform update route failed unexpectedly', {
        error: error?.message || String(error),
        stack: error?.stack,
        path: ctx.path,
        method: ctx.method,
        ip: ctx.ip
      })
      sendError(ctx, 500, 'api.platform_updates.unexpected_error', 'Platform update request failed unexpectedly')
    }
  })
}
