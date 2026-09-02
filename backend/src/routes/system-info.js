import { authenticateRequest } from './authenticate-request.js'
import { attachErrorMetadata, buildErrorBody, conflict, forbidden } from '../lib/errors.js'
import { consumeRateLimitBuckets, getRequestIp } from '../hooks/rate-limit.js'
import { logger } from '../logger.js'

function sendError(ctx, status, code, message, params = {}) {
  ctx.status = status
  ctx.body = buildErrorBody(code, message, params)
}

function requireSystemAdmin(user) {
  if (user?.is_admin !== true) {
    throw forbidden('api.system_info.admin_required', {}, 'Only platform administrators can access system information')
  }
}

async function applyRefreshRateLimit(app, ctx, userId) {
  await consumeRateLimitBuckets(app, {
    errorCode: 'api.system_info.rate_limited',
    buckets: [
      { name: 'system-info:refresh:ip', key: getRequestIp({ headers: ctx.headers, ip: ctx.ip }), limit: 20 },
      { name: 'system-info:refresh:user', key: userId, limit: 10 }
    ]
  })
}

export function configureSystemInfoRoutes(app) {
  app.use(async (ctx, next) => {
    const isUsageRequest = ctx.path === '/system-info/storage-usage' && ctx.method === 'GET'
    const isRefreshRequest = ctx.path === '/system-info/storage-usage/refresh' && ctx.method === 'POST'
    if (!isUsageRequest && !isRefreshRequest) return next()

    try {
      const user = await authenticateRequest(app, ctx)
      if (!user) return
      requireSystemAdmin(user)

      const manager = app.get('storageUsageManager')
      if (!manager) {
        throw conflict('api.system_info.unavailable', {}, 'System information service is not available')
      }

      if (isRefreshRequest) {
        await applyRefreshRateLimit(app, ctx, user.id)
      }

      ctx.status = 200
      ctx.body = isRefreshRequest
        ? await manager.refresh()
        : await manager.getUsage()
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

      logger.error('System info route failed unexpectedly', {
        error: error?.message || String(error),
        path: ctx.path,
        method: ctx.method,
        ip: ctx.ip
      })
      sendError(ctx, 500, 'api.system_info.unexpected_error', 'System information request failed unexpectedly')
    }
  })
}
