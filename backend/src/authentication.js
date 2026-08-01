import { AuthenticationService, JWTStrategy } from '@feathersjs/authentication'
import { LocalStrategy } from '@feathersjs/authentication-local'
import {
  clearAuthenticationRateLimitHook,
  createAuthenticationRateLimitHook
} from './hooks/rate-limit.js'
import { assertUserAccountActive } from './lib/account-state.js'

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

export async function assertActiveLocalAuthenticationResult(context) {
  if (context.data?.strategy === 'local' && context.result?.user) {
    assertUserAccountActive(context.result.user)
  }
  return context
}

export const authentication = (app) => {
  const authService = new NebulynkAuthenticationService(app)

  authService.register('jwt', new JWTStrategy())
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
