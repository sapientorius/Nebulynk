import { authenticateRequest } from './authenticate-request.js'

export function configureMessageForwardRoute(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== '/messages/forward') {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.upload.authentication_required',
      invalidTokenCode: 'api.upload.invalid_token'
    })
    if (!user) return

    try {
      const result = await app.service('messages').forward(ctx.request.body || {}, {
        provider: 'rest',
        authenticated: true,
        user
      })

      ctx.status = 200
      ctx.body = result
    } catch (error) {
      const statusCode = Number(error?.code) || Number(error?.statusCode) || 500
      ctx.status = statusCode
      ctx.body = {
        name: error.name || 'Error',
        message: error.message || 'Unexpected error',
        code: statusCode,
        className: error.className || 'error',
        data: error.data || undefined,
        errors: error.errors || undefined
      }
    }
  })
}
