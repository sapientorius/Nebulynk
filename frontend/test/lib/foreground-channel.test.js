import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resetDesktopWindowState,
  updateDesktopWindowState
} from '../../src/lib/desktop-window-state.js'
import {
  ACTIVITY_HEARTBEAT_THROTTLE_MS,
  resolveForegroundChannelId,
  startForegroundChannelTracking
} from '../../src/lib/foreground-channel.js'

function createRouterHarness(initialRoute = { name: 'App', params: { channelId: 'channel-a' } }) {
  let currentRoute = initialRoute
  const handlers = new Set()

  return {
    router: {
      currentRoute: {
        get value() {
          return currentRoute
        }
      },
      afterEach(handler) {
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      }
    },
    navigate(nextRoute) {
      currentRoute = nextRoute
      for (const handler of handlers) {
        handler(nextRoute)
      }
    }
  }
}

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || new Set()
      handlers.add(handler)
      listeners.set(type, handlers)
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler)
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) {
        handler(event)
      }
    }
  }
}

describe('foreground channel tracking', () => {
  afterEach(() => {
    resetDesktopWindowState()
    if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, '__TAURI_INTERNALS__')) {
      delete window.__TAURI_INTERNALS__
    }
  })

  it('resolves foreground channel ids only for channel routes', () => {
    expect(resolveForegroundChannelId({
      name: 'App',
      params: { channelId: 'channel-1' }
    })).toBe('channel-1')
    expect(resolveForegroundChannelId({
      name: 'ChannelScreenShare',
      params: { channelId: 'channel-2' }
    })).toBe('channel-2')
    expect(resolveForegroundChannelId({
      name: 'Meeting',
      params: { meetingId: 'meeting-1' }
    })).toBe(null)
  })

  it('sends the visible active channel after socket authentication', () => {
    const emitted = []
    const socket = {
      __nebulynkAuthReady: false,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true

    let authHandler = null
    const stop = startForegroundChannelTracking({
      socket,
      router,
      subscribeToAuthenticated(handler) {
        authHandler = handler
        return () => {
          authHandler = null
        }
      },
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    expect(emitted).toEqual([])

    socket.__nebulynkAuthReady = true
    authHandler(socket)

    expect(emitted).toEqual([{
      eventName: 'patch',
      serviceName: 'presence',
      id: 'foreground',
      payload: {
        activeChannelId: 'channel-a',
        isVisible: true,
        lastActivityAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z'
      },
      params: {}
    }])

    stop()
  })

  it('clears the active channel when the document becomes hidden', () => {
    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    targetDocument.visibilityState = 'hidden'
    targetDocument.dispatchEvent({ type: 'visibilitychange' })

    expect(emitted.map((entry) => entry.payload)).toEqual([
      {
        activeChannelId: 'channel-a',
        isVisible: true,
        lastActivityAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z'
      },
      {
        activeChannelId: null,
        isVisible: false,
        updatedAt: '2026-03-19T12:00:00.000Z'
      }
    ])

    stop()
  })

  it('updates the reported active channel when the route changes', () => {
    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router, navigate } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    navigate({
      name: 'App',
      params: { channelId: 'channel-b' }
    })

    expect(emitted.map((entry) => entry.payload.activeChannelId)).toEqual([
      'channel-a',
      'channel-b'
    ])
    expect(emitted[1].payload.lastActivityAt).toBe('2026-03-19T12:00:00.000Z')

    stop()
  })

  it('throttles repeated activity heartbeats while keeping foreground updates immediate', () => {
    let currentTimestamp = '2026-03-19T12:00:00.000Z'
    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => currentTimestamp
    })

    targetWindow.dispatchEvent({ type: 'pointermove' })
    targetWindow.dispatchEvent({ type: 'keydown' })

    expect(emitted).toHaveLength(1)

    currentTimestamp = '2026-03-19T12:00:31.000Z'
    expect(Date.parse(currentTimestamp) - Date.parse('2026-03-19T12:00:00.000Z')).toBeGreaterThanOrEqual(ACTIVITY_HEARTBEAT_THROTTLE_MS)
    targetWindow.dispatchEvent({ type: 'pointermove' })

    expect(emitted).toHaveLength(2)
    expect(emitted[1].payload.lastActivityAt).toBe('2026-03-19T12:00:31.000Z')

    stop()
  })

  it('ignores activity heartbeats while the app is hidden', () => {
    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'hidden'
    targetDocument.hasFocus = () => false

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    targetWindow.dispatchEvent({ type: 'pointermove' })

    expect(emitted).toEqual([{
      eventName: 'patch',
      serviceName: 'presence',
      id: 'foreground',
      payload: {
        activeChannelId: null,
        isVisible: false,
        updatedAt: '2026-03-19T12:00:00.000Z'
      },
      params: {}
    }])

    stop()
  })

  it('keeps the active channel visible on desktop blur while the window remains user-visible', () => {
    if (typeof window !== 'undefined') {
      window.__TAURI_INTERNALS__ = {}
    }

    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true
    updateDesktopWindowState({
      isVisible: true,
      isFocused: true,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-03-19T12:00:00.000Z'
    })

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    updateDesktopWindowState({
      isVisible: true,
      isFocused: false,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-03-19T12:00:01.000Z'
    })
    targetWindow.dispatchEvent({ type: 'blur' })

    expect(emitted.map((entry) => entry.payload)).toEqual([
      {
        activeChannelId: 'channel-a',
        isVisible: true,
        lastActivityAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z'
      }
    ])

    stop()
  })

  it('reacts to desktop occlusion events pushed through the desktop window-state bridge', () => {
    if (typeof window !== 'undefined') {
      window.__TAURI_INTERNALS__ = {}
    }

    const emitted = []
    const socket = {
      __nebulynkAuthReady: true,
      emit: vi.fn((eventName, serviceName, id, payload, params) => {
        emitted.push({ eventName, serviceName, id, payload, params })
      })
    }
    const { router } = createRouterHarness()
    const targetWindow = createEventTarget()
    const targetDocument = createEventTarget()
    targetDocument.visibilityState = 'visible'
    targetDocument.hasFocus = () => true
    updateDesktopWindowState({
      isVisible: true,
      isFocused: true,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-03-19T12:00:00.000Z'
    })

    const stop = startForegroundChannelTracking({
      socket,
      router,
      targetWindow,
      targetDocument,
      now: () => '2026-03-19T12:00:00.000Z'
    })

    updateDesktopWindowState({
      isVisible: true,
      isFocused: false,
      isHidden: false,
      isMinimized: false,
      isOccluded: true,
      updatedAt: '2026-03-19T12:00:01.000Z'
    })
    targetWindow.dispatchEvent({ type: 'nebulynk:desktop-window-state' })

    expect(emitted.map((entry) => entry.payload)).toEqual([
      {
        activeChannelId: 'channel-a',
        isVisible: true,
        lastActivityAt: '2026-03-19T12:00:00.000Z',
        updatedAt: '2026-03-19T12:00:00.000Z'
      },
      {
        activeChannelId: null,
        isVisible: false,
        updatedAt: '2026-03-19T12:00:00.000Z'
      }
    ])

    stop()
  })
})
