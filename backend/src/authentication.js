import { AuthenticationService, JWTStrategy } from '@feathersjs/authentication'
import { LocalStrategy } from '@feathersjs/authentication-local'
import { NotAuthenticated } from '@feathersjs/errors'
import {
  clearAuthenticationRateLimitHook,
  createAuthenticationRateLimitHook
} from './hooks/rate-limit.js'
import { assertUserAccountActive } from './lib/account-state.js'
import { assertAccessTokenVersion, buildAuthTokenPayload } from './lib/auth-token-version.js'

export async function assertCurrentAccessTokenVersion(app, payload, user) {
  const userId = typeof payload?.sub === 'string' && payload.sub
    ? payload.sub
    : user?.id
  const db = app?.get?.('postgresqlClient')

  if (!db || !userId) {
    assertAccessTokenVersion(payload, user)
    return
  }

  const currentUser = await db('users')
    .select('id', 'auth_version')
    .where('id', userId)
    .first()

  if (!currentUser) {
    throw new NotAuthenticated('User not found')
  }

  assertAccessTokenVersion(payload, currentUser)
}

export function resolveRememberJwtOptions(data, configuration) {
  const rememberRequested = data?.strategy === 'local' && data?.remember === true
  const rememberJwtOptions = configuration?.rememberJwtOptions

  if (!rememberRequested || !rememberJwtOptions || typeof rememberJwtOptions !== 'object') {
    return {}
  }

  return { ...rememberJwtOptions }
}

export function resolveBrowserJwtOptions(data, configuration) {
  const browserSessionRequested = data?.strategy === 'local' && data?.session_mode === 'browser'
  const browserJwtOptions = configuration?.browserJwtOptions

  if (!browserSessionRequested || !browserJwtOptions || typeof browserJwtOptions !== 'object') {
    return {}
  }

  return { ...browserJwtOptions }
}

class NebulynkAuthenticationService extends AuthenticationService {
  async getPayload(authResult, params) {
    const payload = await super.getPayload(authResult, params)
    const userId = authResult.user?.id
    const db = this.app.get('postgresqlClient')
    const currentUser = userId && db
      ? await db('users').where('id', userId).first()
      : authResult.user
    return {
      ...payload,
      ...buildAuthTokenPayload(currentUser || authResult.user)
    }
  }

  async create(data, params = {}) {
    const browserJwtOptions = resolveBrowserJwtOptions(data, this.configuration)
    const rememberJwtOptions = Object.keys(browserJwtOptions).length > 0
      ? {}
      : resolveRememberJwtOptions(data, this.configuration)
    const resolvedJwtOptions = Object.keys(browserJwtOptions).length > 0
      ? browserJwtOptions
      : rememberJwtOptions
    const nextParams = Object.keys(resolvedJwtOptions).length > 0
      ? {
          ...params,
          jwtOptions: {
            ...(params?.jwtOptions || {}),
            ...resolvedJwtOptions
          }
        }
      : params

    return super.create(data, nextParams)
  }
}

class NebulynkJwtStrategy extends JWTStrategy {
  async authenticate(authentication, params) {
    const result = await super.authenticate(authentication, params)
    await assertCurrentAccessTokenVersion(
      this.app,
      result.authentication?.payload,
      result.user
    )
    return result
  }
}

export async function assertActiveLocalAuthenticationResult(context) {
  if (context.data?.strategy === 'local' && context.result?.user) {
    assertUserAccountActive(context.result.user)
  }
  return context
}

export const authentication = (app) => {
  const authService = new NebulynkAuthenticationService(app)

  authService.register('jwt', new NebulynkJwtStrategy())
  authService.register('local', new LocalStrategy())

  app.use('authentication', authService)

  app.service('authentication').hooks({
    before: {
      create: [createAuthenticationRateLimitHook()]
    },
    after: {
      create: [
        assertActiveLocalAuthenticationResult,
        clearAuthenticationRateLimitHook
      ]
    }
  })
}
