import { setActiveApiClientContext } from './api.js'
import { setActiveSocketClientContext } from './socket.js'

export function setDesktopWorkspaceClientContext(options = {}) {
  const apiClient = setActiveApiClientContext({
    defaultSessionTransport: 'body',
    persistCsrfToStorage: false,
    ...options
  })

  setActiveSocketClientContext({
    apiClient
  })

  return apiClient
}
