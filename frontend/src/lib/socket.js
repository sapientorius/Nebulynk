import { createSocketClient } from './socket-client.js'
import { getActiveApiClient } from './api.js'

let activeSocketClient = createSocketClient({
  apiClient: getActiveApiClient()
})

export function getActiveSocketClient() {
  return activeSocketClient
}

export function setActiveSocketClient(client) {
  if (!client) return activeSocketClient
  activeSocketClient?.destroy?.()
  activeSocketClient = client
  return activeSocketClient
}

export function setActiveSocketClientContext(options = {}) {
  activeSocketClient?.destroy?.()
  activeSocketClient = createSocketClient({
    apiClient: options.apiClient || getActiveApiClient(),
    ...options
  })
  return activeSocketClient
}

export { createSocketClient }

export function connectSocket() {
  return activeSocketClient.connectSocket()
}

export function getSocket() {
  return activeSocketClient.getSocket()
}

export function disconnectSocket() {
  return activeSocketClient.disconnectSocket()
}

export function subscribeToSocketAuthenticated(listener) {
  return activeSocketClient.subscribeToSocketAuthenticated(listener)
}
