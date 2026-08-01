import { buildErrorBody } from '../lib/errors.js'
import { assertUserAccountActive } from '../lib/account-state.js'

export async function authenticateRequest(app, ctx, {
  authRequiredCode = 'api.authentication.authentication_required',
  invalidTokenCode = 'api.authentication.invalid_token'
} = {}) {
  const authHeader = ctx.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401
    ctx.body = buildErrorBody(authRequiredCode, 'Authentication required')
    return null
  }

  try {
    const token = authHeader.replace('Bearer ', '')
    const result = await app.service('authentication').verifyAccessToken(token)
    const db = app.get('postgresqlClient')
    const user = await db('users').where('id', result.sub).first()
    if (!user) {
      throw new Error('User not found')
    }
    assertUserAccountActive(user)
    return user
  } catch (error) {
    ctx.status = error?.code === 403 ? 403 : 401
    ctx.body = buildErrorBody(
      ctx.status === 403 ? 'api.authentication.account_disabled' : invalidTokenCode,
      ctx.status === 403 ? 'Account disabled' : 'Invalid token'
    )
    return null
  }
}
