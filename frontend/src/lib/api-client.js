import { createHttpTransport } from './api-client/transport.js'
import { createApiSession } from './api-client/session.js'
import { createPlatformEndpoints } from './api-client/platform.js'
import { createAdministrationEndpoints } from './api-client/administration.js'
import { createAuthenticationEndpoints } from './api-client/authentication.js'

export { resolveSocketBaseUrl } from './api-client/base-url.js'

// Each composition owns its HTTP client and mutable session resources.
export function createApiClient(options = {}) {
  const transport = createHttpTransport(options)
  const session = createApiSession(transport, options)
  transport.installSessionInterceptors(session)
  return {
    http: transport.http,
    getBaseUrl: transport.getBaseUrl,
    resolveApiUrl: transport.resolveApiUrl,
    ...session,
    ...createPlatformEndpoints(transport),
    ...createAdministrationEndpoints(transport),
    ...createAuthenticationEndpoints({ http: transport.http, completeBrowserAuthentication: session.completeBrowserAuthentication }, options)
  }
}
