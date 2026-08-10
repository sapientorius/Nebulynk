import { io } from 'socket.io-client'
import { resolveSocketBaseUrl } from './api-client.js'

function readViteEnv(key) {
  if (typeof import.meta === 'undefined') return ''
  return import.meta.env?.[key]?.trim?.() || ''
}

export function createSocketClient(options = {}) {
  let socket = null
  const authenticatedListeners = new Set()
  let stopAuthSubscription = null
  let authRecoveryRequest = null

  function getToken() {
    return options.apiClient?.getStoredAccessToken?.() || null
  }

  function getBackendUrl() {
    const explicitBackendUrl = typeof options.getBackendUrl === 'function'
      ? options.getBackendUrl()
      : options.backendUrl

    if (typeof explicitBackendUrl === 'string' && explicitBackendUrl.trim()) {
      return explicitBackendUrl.trim().replace(/\/+$/, '')
    }

    const apiBaseUrl = options.apiClient?.getBaseUrl?.()
    return resolveSocketBaseUrl(apiBaseUrl || readViteEnv('VITE_BACKEND_URL') || 'http://localhost:3030', {
      backendBaseUrl: readViteEnv('VITE_BACKEND_URL') || ''
    })
  }

  function notifyAuthenticatedListeners(authenticatedSocket, result) {
    for (const listener of authenticatedListeners) {
      listener(authenticatedSocket, result)
    }
  }

  function markIntentionalDisconnect() {
    if (!socket) return
    socket.__nebulynkIntentionalDisconnect = true
  }

  function isCurrentSocketAuthAttempt(candidateSocket, accessToken) {
    return socket === candidateSocket
      && candidateSocket?.__nebulynkAccessToken === accessToken
      && getToken() === accessToken
  }

  async function attemptAuthRecovery(reason, { candidateSocket = null, accessToken = null } = {}) {
    if (candidateSocket && !isCurrentSocketAuthAttempt(candidateSocket, accessToken)) {
      return null
    }

    if (authRecoveryRequest) {
      return authRecoveryRequest
    }

    if (typeof options.apiClient?.restoreBrowserSession !== 'function' || !getToken()) {
      return null
    }

    authRecoveryRequest = options.apiClient.restoreBrowserSession({ forceRefresh: true })
      .catch((error) => {
        console.warn(`Socket auth recovery failed (${reason}):`, error)
        return null
      })
      .finally(() => {
        authRecoveryRequest = null
      })

    return authRecoveryRequest
  }

  function connectSocket() {
    if (socket?.connected) return socket

    const token = getToken()
    if (!token) return null

    const connectedSocket = io(getBackendUrl(), {
      auth: { token }
    })
    socket = connectedSocket
    connectedSocket.__nebulynkAccessToken = token
    connectedSocket.__nebulynkAuthReady = false
    connectedSocket.__nebulynkIntentionalDisconnect = false

    connectedSocket.on('connect', () => {
      if (socket !== connectedSocket) return

      const currentToken = getToken()
      if (!currentToken) return
      connectedSocket.__nebulynkIntentionalDisconnect = false
      connectedSocket.__nebulynkAccessToken = currentToken
      connectedSocket.auth = { token: currentToken }

      connectedSocket.emit('create', 'authentication', {
        strategy: 'jwt',
        accessToken: currentToken
      }, (error, result) => {
        if (!isCurrentSocketAuthAttempt(connectedSocket, currentToken)) {
          return
        }

        if (error) {
          console.error('Socket auth failed:', error)
          connectedSocket.__nebulynkAuthReady = false
          attemptAuthRecovery('auth_failed', {
            candidateSocket: connectedSocket,
            accessToken: currentToken
          }).catch(() => {})
          return
        }

        connectedSocket.__nebulynkAuthReady = true
        notifyAuthenticatedListeners(connectedSocket, result)
      })
    })

    connectedSocket.on('disconnect', (reason) => {
      if (socket !== connectedSocket) return

      const accessToken = connectedSocket.__nebulynkAccessToken
      const shouldAttemptRecovery = connectedSocket.__nebulynkIntentionalDisconnect !== true
        && reason === 'io server disconnect'
        && isCurrentSocketAuthAttempt(connectedSocket, accessToken)

      connectedSocket.__nebulynkIntentionalDisconnect = false
      connectedSocket.__nebulynkAuthReady = false

      if (shouldAttemptRecovery) {
        attemptAuthRecovery(reason, {
          candidateSocket: connectedSocket,
          accessToken
        }).catch(() => {})
      }
    })

    return connectedSocket
  }

  function getSocket() {
    return socket
  }

  function disconnectSocket() {
    if (socket) {
      markIntentionalDisconnect()
      socket.disconnect()
      socket = null
    }
  }

  function subscribeToSocketAuthenticated(listener) {
    authenticatedListeners.add(listener)
    return () => {
      authenticatedListeners.delete(listener)
    }
  }

  function handleAuthStateChange({ accessToken }) {
    if (!socket) return

    if (!accessToken) {
      socket.__nebulynkAuthReady = false
      if (socket.connected) {
        markIntentionalDisconnect()
        socket.disconnect()
      }
      return
    }

    if (socket.__nebulynkAccessToken === accessToken && socket.connected) {
      return
    }

    socket.__nebulynkAccessToken = accessToken
    socket.auth = { token: accessToken }
    socket.__nebulynkAuthReady = false

    if (socket.connected) {
      markIntentionalDisconnect()
      socket.disconnect()
    }

    socket.connect()
  }

  function start() {
    if (typeof options.apiClient?.subscribeToAuthState === 'function' && !stopAuthSubscription) {
      stopAuthSubscription = options.apiClient.subscribeToAuthState(handleAuthStateChange)
    }
  }

  function destroy() {
    disconnectSocket()
    stopAuthSubscription?.()
    stopAuthSubscription = null
  }

  start()

  return {
    connectSocket,
    getSocket,
    disconnectSocket,
    subscribeToSocketAuthenticated,
    destroy
  }
}
