import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createIdMock = vi.hoisted(() => vi.fn(() => 'session-cuid'))
const triggerExternalPttDownMock = vi.hoisted(() => vi.fn())
const triggerExternalPttUpMock = vi.hoisted(() => vi.fn())
const setDesktopPttBindingStatusMock = vi.hoisted(() => vi.fn())
const getModeMock = vi.hoisted(() => vi.fn(() => 'ptt'))
const getPttKeyMock = vi.hoisted(() => vi.fn(() => 'KeyV'))
const subscribeToSettingsMock = vi.hoisted(() => vi.fn((listener) => {
  listener({
    mode: 'ptt',
    pttKey: 'KeyV'
  })
  return () => {}
}))

vi.mock('@paralleldrive/cuid2', () => ({
  createId: createIdMock
}))

vi.mock('../../src/lib/mic-activation.js', () => ({
  triggerExternalPttDown: triggerExternalPttDownMock,
  triggerExternalPttUp: triggerExternalPttUpMock,
  setDesktopPttBindingStatus: setDesktopPttBindingStatusMock,
  getMode: getModeMock,
  getPttKey: getPttKeyMock,
  subscribeToSettings: subscribeToSettingsMock
}))

class MockWebSocket {
  static instances = []
  static OPEN = 1

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.listeners = new Map()
    this.sent = []
    MockWebSocket.instances.push(this)
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler)
  }

  send(payload) {
    this.sent.push(JSON.parse(payload))
  }

  close() {
    this.readyState = 3
  }

  emit(type, payload = {}) {
    if (type === 'open') {
      this.readyState = MockWebSocket.OPEN
    }
    this.listeners.get(type)?.(payload)
  }
}

function buildStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    }
  }
}

if (!globalThis.localStorage) {
  globalThis.localStorage = buildStorage()
}

if (!globalThis.sessionStorage) {
  globalThis.sessionStorage = buildStorage()
}

describe('browser ptt helper bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    MockWebSocket.instances.length = 0
    triggerExternalPttDownMock.mockReset()
    triggerExternalPttUpMock.mockReset()
    setDesktopPttBindingStatusMock.mockReset()
    getModeMock.mockClear()
    getPttKeyMock.mockClear()
    subscribeToSettingsMock.mockClear()

    const localStorage = buildStorage()
    const sessionStorage = buildStorage()
    globalThis.localStorage = localStorage
    globalThis.sessionStorage = sessionStorage
    globalThis.WebSocket = MockWebSocket
    globalThis.window = {
      location: {
        origin: 'https://chat.example.com',
        pathname: '/channels/general',
        search: '',
        hash: ''
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      matchMedia: vi.fn(() => ({
        matches: false
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout,
      clearTimeout
    }
    globalThis.document = {
      hidden: false,
      hasFocus: () => true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    delete globalThis.WebSocket
    delete globalThis.window
    delete globalThis.document
    delete globalThis.localStorage
    delete globalThis.sessionStorage
  })

  it('sends hello, session_state, and ptt_config after authorization', async () => {
    const { startBrowserPttHelperBridge } = await import('../../src/lib/browser-ptt-helper-bridge.js')

    startBrowserPttHelperBridge({
      router: {
        currentRoute: {
          value: {
            fullPath: '/channels/general'
          }
        },
        afterEach() {
          return () => {}
        }
      }
    })

    const socket = MockWebSocket.instances[0]
    expect(socket.url).toBe('ws://127.0.0.1:47641/ws')

    socket.emit('open')
    expect(socket.sent[0]).toEqual({
      type: 'hello',
      payload: {
        protocolVersion: '1',
        origin: 'https://chat.example.com',
        sessionId: 'session-cuid',
        clientKind: 'browser',
        pairingToken: null
      }
    })

    socket.emit('message', {
      data: JSON.stringify({
        type: 'hello_ack',
        payload: {
          authorized: true,
          bindingStatus: {
            mode: 'global-raw-input',
            keyCode: 'KeyV',
            isGlobal: true,
            usesRawInput: true,
            allowPassThrough: true,
            platform: 'windows'
          },
          targetState: {
            isTarget: true,
            targetSessionId: 'session-cuid'
          }
        }
      })
    })

    expect(socket.sent[1].type).toBe('session_state')
    expect(socket.sent[1].payload).toEqual({
      route: '/channels/general',
      focused: true,
      visible: true,
      baseUrl: 'https://chat.example.com'
    })
    expect(socket.sent[2]).toEqual({
      type: 'ptt_config',
      payload: {
        mode: 'ptt',
        keyCode: 'KeyV',
        allowPassThrough: true,
        platformStrategy: 'auto'
      }
    })
    expect(setDesktopPttBindingStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'global-raw-input',
      keyCode: 'KeyV'
    }))
  })

  it('stores the pairing token after approval and updates the helper state', async () => {
    const { startBrowserPttHelperBridge } = await import('../../src/lib/browser-ptt-helper-bridge.js')
    const { nativePttState } = await import('../../src/lib/native-ptt-state.js')

    startBrowserPttHelperBridge()
    const socket = MockWebSocket.instances[0]
    socket.emit('open')
    socket.emit('message', {
      data: JSON.stringify({
        type: 'paired',
        payload: {
          pairingToken: 'token-123',
          bindingStatus: {
            mode: 'focused-only',
            keyCode: null,
            isGlobal: false,
            usesRawInput: false,
            allowPassThrough: true,
            platform: 'windows'
          }
        }
      })
    })

    expect(globalThis.localStorage.getItem('nebulynk:ptt-helper:pairing-token')).toBe('token-123')
    expect(nativePttState.transport).toBe('browser-helper')
    expect(nativePttState.authorized).toBe(true)
  })

  it('forwards external push-to-talk events from the helper socket', async () => {
    const { startBrowserPttHelperBridge } = await import('../../src/lib/browser-ptt-helper-bridge.js')

    startBrowserPttHelperBridge()
    const socket = MockWebSocket.instances[0]
    socket.emit('open')
    socket.emit('message', {
      data: JSON.stringify({ type: 'ptt_down' })
    })
    socket.emit('message', {
      data: JSON.stringify({ type: 'ptt_up' })
    })

    expect(triggerExternalPttDownMock).toHaveBeenCalledTimes(1)
    expect(triggerExternalPttUpMock).toHaveBeenCalledTimes(1)
  })

  it('ignores stale close events after a replacement socket is connected', async () => {
    const { startBrowserPttHelperBridge } = await import('../../src/lib/browser-ptt-helper-bridge.js')
    const { nativePttState } = await import('../../src/lib/native-ptt-state.js')

    startBrowserPttHelperBridge()
    const firstSocket = MockWebSocket.instances[0]
    firstSocket.emit('open')
    firstSocket.emit('close')

    vi.runOnlyPendingTimers()

    const secondSocket = MockWebSocket.instances[1]
    expect(secondSocket).toBeTruthy()

    secondSocket.emit('open')
    secondSocket.emit('message', {
      data: JSON.stringify({
        type: 'hello_ack',
        payload: {
          authorized: true,
          bindingStatus: {
            mode: 'global-raw-input',
            keyCode: 'KeyV',
            isGlobal: true,
            usesRawInput: true,
            allowPassThrough: true,
            platform: 'windows'
          },
          targetState: {
            isTarget: true,
            targetSessionId: 'session-cuid'
          }
        }
      })
    })

    firstSocket.emit('close')

    expect(nativePttState.helperState).toBe('connected')
    expect(nativePttState.authorized).toBe(true)
  })
})
