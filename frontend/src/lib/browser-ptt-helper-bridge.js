import { createId } from '@paralleldrive/cuid2'
import * as micActivation from './mic-activation.js'
import {
  DEFAULT_DESKTOP_PTT_BINDING_STATUS,
  createDesktopPttBindingPayload
} from './desktop-ptt-shortcut.js'
import {
  applyNativePttBindingStatus,
  nativePttState,
  resetNativePttState,
  updateNativePttState
} from './native-ptt-state.js'
import { isDesktopRuntime } from './runtime.js'

const HELPER_URL = 'ws://127.0.0.1:47641/ws'
const HELPER_PROTOCOL_VERSION = '1'
const PAIRING_TOKEN_KEY = 'nebulynk:ptt-helper:pairing-token'
const SESSION_ID_KEY = 'nebulynk:ptt-helper:session-id'
const RECONNECT_BASE_MS = 750
const RECONNECT_MAX_MS = 10000

let socket = null
let reconnectTimer = null
let reconnectAttempt = 0
let started = false
let currentRoute = '/'
let routerCleanup = null
let settingsCleanup = null
let browserEventCleanup = []
let activeSocketSerial = 0
let heartbeatTimer = null

function isWindowsBrowserHelperCandidate(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!targetWindow || isDesktopRuntime(targetWindow) || typeof WebSocket === 'undefined') {
    return false
  }

  const platform = targetWindow.navigator?.userAgentData?.platform || targetWindow.navigator?.platform || ''
  const userAgent = targetWindow.navigator?.userAgent || ''
  return /win/i.test(platform) || /windows/i.test(userAgent)
}

function getPairingToken() {
  try {
    return globalThis.localStorage?.getItem(PAIRING_TOKEN_KEY) || null
  } catch {
    return null
  }
}

function setPairingToken(token) {
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    if (!token) {
      storage.removeItem(PAIRING_TOKEN_KEY)
      return
    }
    storage.setItem(PAIRING_TOKEN_KEY, token)
  } catch {
    // Ignore storage issues and keep the in-memory session alive.
  }
}

function getSessionId() {
  try {
    const storage = globalThis.sessionStorage
    if (!storage) return createId()
    const existing = storage.getItem(SESSION_ID_KEY)
    if (existing) return existing
    const next = createId()
    storage.setItem(SESSION_ID_KEY, next)
    return next
  } catch {
    return createId()
  }
}

function helperStateFromStatus(status) {
  if (status?.reason === 'paused') return 'paused'
  if (status?.mode === 'unsupported') return 'unsupported'
  return 'connected'
}

function isLiveSocket(candidate) {
  return candidate && (
    candidate.readyState === WebSocket.CONNECTING
    || candidate.readyState === WebSocket.OPEN
  )
}

function sendEnvelope(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type,
    payload
  }))
}

function currentBrowserRoute() {
  if (typeof window === 'undefined') return currentRoute
  const pathname = typeof window.location?.pathname === 'string' ? window.location.pathname : '/'
  const search = typeof window.location?.search === 'string' ? window.location.search : ''
  const hash = typeof window.location?.hash === 'string' ? window.location.hash : ''
  return `${pathname || '/'}${search}${hash}`
}

function currentSessionStatePayload() {
  const focused = typeof document !== 'undefined'
    ? !document.hidden && typeof document.hasFocus === 'function' && document.hasFocus()
    : true

  return {
    route: currentRoute || currentBrowserRoute(),
    focused,
    visible: typeof document !== 'undefined' ? !document.hidden : true,
    baseUrl: typeof window !== 'undefined' ? window.location.origin : ''
  }
}

function applyBindingStatus(status, overrides = {}) {
  micActivation.setDesktopPttBindingStatus(status || DEFAULT_DESKTOP_PTT_BINDING_STATUS)
  applyNativePttBindingStatus(status || DEFAULT_DESKTOP_PTT_BINDING_STATUS, {
    transport: 'browser-helper',
    helperState: helperStateFromStatus(status),
    ...overrides
  })
}

function resetUnavailableState(message = null) {
  micActivation.setDesktopPttBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS)
  resetNativePttState({
    transport: 'browser-helper',
    helperState: 'unavailable',
    lastError: message
  })
}

function scheduleReconnect() {
  if (!started || reconnectTimer) return
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * (2 ** reconnectAttempt))
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

function sendSessionState() {
  sendEnvelope('session_state', currentSessionStatePayload())
}

function scheduleSessionStateSync() {
  if (typeof globalThis.setTimeout !== 'function') return
  globalThis.setTimeout(() => sendSessionState(), 150)
  globalThis.setTimeout(() => sendSessionState(), 750)
}

function sendPttConfig() {
  const payload = createDesktopPttBindingPayload({
    mode: micActivation.getMode(),
    pttKey: micActivation.getPttKey()
  })
  sendEnvelope('ptt_config', payload)
}

function handleMessage(event) {
  let envelope = null
  try {
    envelope = JSON.parse(event.data)
  } catch {
    return
  }

  const payload = envelope?.payload || {}
  switch (envelope?.type) {
    case 'hello_ack':
      reconnectAttempt = 0
      updateNativePttState({
        transport: 'browser-helper',
        helperState: helperStateFromStatus(payload.bindingStatus),
        authorized: payload.authorized === true,
        isTarget: payload.targetState?.isTarget === true,
        targetSessionId: payload.targetState?.targetSessionId || null,
        lastError: null
      })
      applyBindingStatus(payload.bindingStatus, {
        authorized: payload.authorized === true,
        isTarget: payload.targetState?.isTarget === true,
        targetSessionId: payload.targetState?.targetSessionId || null
      })
      if (payload.authorized === true) {
        sendSessionState()
        sendPttConfig()
        scheduleSessionStateSync()
      }
      break
    case 'pairing_required':
      updateNativePttState({
        transport: 'browser-helper',
        helperState: 'pairing-required',
        authorized: false,
        isTarget: false,
        targetSessionId: null,
        lastError: null
      })
      applyBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS, {
        helperState: 'pairing-required',
        authorized: false,
        isTarget: false,
        targetSessionId: null
      })
      break
    case 'paired':
      if (typeof payload.pairingToken === 'string' && payload.pairingToken.trim()) {
        setPairingToken(payload.pairingToken.trim())
      }
      updateNativePttState({
        transport: 'browser-helper',
        helperState: helperStateFromStatus(payload.bindingStatus),
        authorized: true,
        lastError: null
      })
      applyBindingStatus(payload.bindingStatus, {
        authorized: true
      })
      sendSessionState()
      sendPttConfig()
      scheduleSessionStateSync()
      break
    case 'binding_status':
      applyBindingStatus(payload, {
        authorized: true,
        isTarget: undefined
      })
      break
    case 'target_state':
      updateNativePttState({
        transport: 'browser-helper',
        helperState: 'connected',
        authorized: true,
        isTarget: payload.isTarget === true,
        targetSessionId: payload.targetSessionId || null
      })
      break
    case 'ptt_down':
      micActivation.triggerExternalPttDown()
      break
    case 'ptt_up':
      micActivation.triggerExternalPttUp()
      break
    case 'error':
      if (payload.code === 'invalid_pairing_token' || payload.code === 'origin_revoked') {
        setPairingToken(null)
      }
      updateNativePttState({
        transport: 'browser-helper',
        helperState: payload.code === 'pairing_rejected' ? 'pairing-required' : nativePttState.helperState,
        lastError: payload.message || payload.code || 'helper_error'
      })
      break
  }
}

function connect() {
  if (!started || !isWindowsBrowserHelperCandidate()) return
  if (isLiveSocket(socket)) return

  const nextSocket = new WebSocket(HELPER_URL)
  const socketSerial = ++activeSocketSerial
  socket = nextSocket
  updateNativePttState({
    transport: 'browser-helper',
    helperState: 'connecting',
    lastError: null
  })

  nextSocket.addEventListener('open', () => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    reconnectAttempt = 0
    sendEnvelope('hello', {
      protocolVersion: HELPER_PROTOCOL_VERSION,
      origin: window.location.origin,
      sessionId: getSessionId(),
      clientKind: window.matchMedia?.('(display-mode: standalone)')?.matches ? 'pwa' : 'browser',
      pairingToken: getPairingToken()
    })
  })

  nextSocket.addEventListener('message', (event) => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    handleMessage(event)
  })
  nextSocket.addEventListener('error', () => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    resetUnavailableState('helper_socket_error')
  })
  nextSocket.addEventListener('close', () => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    socket = null
    resetUnavailableState('helper_disconnected')
    scheduleReconnect()
  })
}

export function startBrowserPttHelperBridge({ router } = {}) {
  if (!isWindowsBrowserHelperCandidate() || started) {
    return () => {}
  }

  started = true
  currentRoute = router?.currentRoute?.value?.fullPath || currentBrowserRoute()
  resetNativePttState({
    transport: 'browser-helper',
    helperState: 'idle'
  })

  if (router) {
    routerCleanup?.()
    routerCleanup = router.afterEach((to) => {
      currentRoute = to?.fullPath || currentBrowserRoute()
      sendSessionState()
    })
  }

  settingsCleanup = micActivation.subscribeToSettings(() => {
    sendPttConfig()
  })

  const focusListener = () => sendSessionState()
  const blurListener = () => sendSessionState()
  const visibilityListener = () => sendSessionState()
  const beforeUnloadListener = () => sendEnvelope('disconnect')

  window.addEventListener('focus', focusListener)
  window.addEventListener('blur', blurListener)
  document.addEventListener('visibilitychange', visibilityListener)
  window.addEventListener('beforeunload', beforeUnloadListener)
  browserEventCleanup = [
    () => window.removeEventListener('focus', focusListener),
    () => window.removeEventListener('blur', blurListener),
    () => document.removeEventListener('visibilitychange', visibilityListener),
    () => window.removeEventListener('beforeunload', beforeUnloadListener)
  ]
  heartbeatTimer = globalThis.setInterval(() => {
    sendSessionState()
    sendPttConfig()
  }, 2000)

  connect()

  return () => {
    started = false
    routerCleanup?.()
    routerCleanup = null
    settingsCleanup?.()
    settingsCleanup = null
    for (const cleanup of browserEventCleanup) cleanup()
    browserEventCleanup = []
    if (heartbeatTimer) {
      globalThis.clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    sendEnvelope('disconnect')
    activeSocketSerial += 1
    socket?.close()
    socket = null
    resetNativePttState()
  }
}
