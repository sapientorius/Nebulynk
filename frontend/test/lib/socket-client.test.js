import { beforeEach, describe, expect, it, vi } from 'vitest'

const socketIoMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: socketIoMock
}))

function createSocketHarness() {
  const handlers = new Map()
  const managerHandlers = new Map()
  const engineHandlers = new Map()
  const authAttempts = []
  const engine = {
    on: vi.fn((eventName, handler) => {
      engineHandlers.set(eventName, handler)
    })
  }
  const manager = {
    engine,
    on: vi.fn((eventName, handler) => {
      managerHandlers.set(eventName, handler)
    })
  }

  const socket = {
    connected: false,
    auth: {},
    io: manager,
    on: vi.fn((eventName, handler) => {
      handlers.set(eventName, handler)
    }),
    emit: vi.fn((eventName, serviceName, payload, callback) => {
      if (eventName === 'create' && serviceName === 'authentication') {
        authAttempts.push({ payload, callback })
      }
    }),
    connect: vi.fn(() => {
      socket.connected = true
    }),
    disconnect: vi.fn((reason = 'io client disconnect') => {
      socket.connected = false
      handlers.get('disconnect')?.(reason)
    })
  }

  return {
    socket,
    triggerConnect() {
      socket.connected = true
      handlers.get('connect')?.()
    },
    triggerDisconnect(reason) {
      socket.connected = false
      handlers.get('disconnect')?.(reason)
    },
    triggerConnectError(error = new Error('connection refused')) {
      handlers.get('connect_error')?.(error)
    },
    triggerReconnectError(error = new Error('reconnect failed')) {
      managerHandlers.get('reconnect_error')?.(error)
    },
    triggerUpgradeError(error = new Error('websocket upgrade failed')) {
      engineHandlers.get('upgradeError')?.(error)
    },
    getAuthAttempt(index = authAttempts.length - 1) {
      return authAttempts[index]
    },
    failAuthentication(index = authAttempts.length - 1, error = new Error('jwt expired')) {
      authAttempts[index]?.callback?.(error)
    },
    succeedAuthentication(index = authAttempts.length - 1, result = { accessToken: 'accepted-token' }) {
      authAttempts[index]?.callback?.(null, result)
    }
  }
}

describe('createSocketClient', () => {
  beforeEach(() => {
    vi.resetModules()
    socketIoMock.mockReset()
  })

  it('refreshes the session and reconnects with the rotated token after socket auth failure', async () => {
    const harness = createSocketHarness()
    socketIoMock.mockReturnValue(harness.socket)

    let accessToken = 'expired-token'
    let authStateListener = null
    const apiClient = {
      getStoredAccessToken: vi.fn(() => accessToken),
      getBaseUrl: vi.fn(() => 'https://chat.example.com/api'),
      subscribeToAuthState: vi.fn((listener) => {
        authStateListener = listener
        return () => {
          authStateListener = null
        }
      }),
      restoreBrowserSession: vi.fn(async () => {
        accessToken = 'rotated-token'
        authStateListener?.({ accessToken })
        return { accessToken }
      })
    }

    const { createSocketClient } = await import('../../src/lib/socket-client.js')
    const client = createSocketClient({ apiClient })

    client.connectSocket()
    harness.triggerConnect()
    harness.failAuthentication()
    await Promise.resolve()
    await Promise.resolve()

    expect(apiClient.restoreBrowserSession).toHaveBeenCalledWith({ forceRefresh: true })
    expect(harness.socket.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.socket.connect).toHaveBeenCalledTimes(1)
    expect(harness.socket.auth).toEqual({ token: 'rotated-token' })

    harness.triggerConnect()
    expect(harness.getAuthAttempt(1).payload).toEqual({
      strategy: 'jwt',
      accessToken: 'rotated-token'
    })
    harness.succeedAuthentication(1)
    expect(apiClient.restoreBrowserSession).toHaveBeenCalledTimes(1)

    client.destroy()
  })

  it('ignores a late failure for a token that has already been rotated', async () => {
    const harness = createSocketHarness()
    socketIoMock.mockReturnValue(harness.socket)

    let accessToken = 'revoked-token'
    let authStateListener = null
    const apiClient = {
      getStoredAccessToken: vi.fn(() => accessToken),
      getBaseUrl: vi.fn(() => 'https://chat.example.com/api'),
      subscribeToAuthState: vi.fn((listener) => {
        authStateListener = listener
        return () => {
          authStateListener = null
        }
      }),
      restoreBrowserSession: vi.fn()
    }

    const { createSocketClient } = await import('../../src/lib/socket-client.js')
    const client = createSocketClient({ apiClient })

    client.connectSocket()
    harness.triggerConnect()
    expect(harness.getAuthAttempt(0).payload.accessToken).toBe('revoked-token')

    accessToken = 'rotated-token'
    authStateListener?.({ accessToken })
    harness.triggerConnect()
    harness.succeedAuthentication(1)
    harness.failAuthentication(0)
    await Promise.resolve()

    expect(apiClient.restoreBrowserSession).not.toHaveBeenCalled()
    expect(harness.socket.__nebulynkAuthReady).toBe(true)
    expect(harness.getAuthAttempt(1).payload.accessToken).toBe('rotated-token')

    client.destroy()
  })

  it('coalesces repeated server disconnect recovery attempts into a single refresh', async () => {
    const harness = createSocketHarness()
    socketIoMock.mockReturnValue(harness.socket)

    let authStateListener = null
    let resolveRecovery = null
    const recoveryPromise = new Promise((resolve) => {
      resolveRecovery = resolve
    })
    const apiClient = {
      getStoredAccessToken: vi.fn(() => 'token-1'),
      getBaseUrl: vi.fn(() => 'https://chat.example.com/api'),
      subscribeToAuthState: vi.fn((listener) => {
        authStateListener = listener
        return () => {
          authStateListener = null
        }
      }),
      restoreBrowserSession: vi.fn(async () => {
        await recoveryPromise
        authStateListener?.({ accessToken: 'token-2' })
        return { accessToken: 'token-2' }
      })
    }

    const { createSocketClient } = await import('../../src/lib/socket-client.js')
    const client = createSocketClient({ apiClient })

    client.connectSocket()
    harness.triggerDisconnect('io server disconnect')
    harness.triggerDisconnect('io server disconnect')
    await Promise.resolve()

    expect(apiClient.restoreBrowserSession).toHaveBeenCalledTimes(1)

    resolveRecovery()
    await Promise.resolve()
    await Promise.resolve()

    client.destroy()
  })

  it('logs clear development diagnostics for connection, reconnect, and transport upgrade failures', async () => {
    const harness = createSocketHarness()
    socketIoMock.mockReturnValue(harness.socket)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const apiClient = {
      getStoredAccessToken: vi.fn(() => 'token-1'),
      getBaseUrl: vi.fn(() => 'https://chat.example.com/api')
    }

    const { createSocketClient } = await import('../../src/lib/socket-client.js')
    const client = createSocketClient({ apiClient })
    client.connectSocket()

    const connectionError = new Error('connection refused')
    const reconnectError = new Error('reconnect failed')
    const upgradeError = new Error('websocket upgrade failed')
    harness.triggerConnectError(connectionError)
    harness.triggerReconnectError(reconnectError)
    harness.triggerUpgradeError(upgradeError)

    expect(warning).toHaveBeenNthCalledWith(1, '[Socket] connection failed:', connectionError)
    expect(warning).toHaveBeenNthCalledWith(2, '[Socket] reconnect failed:', reconnectError)
    expect(warning).toHaveBeenNthCalledWith(3, '[Socket] transport upgrade failed:', upgradeError)

    client.destroy()
    warning.mockRestore()
  })
})
