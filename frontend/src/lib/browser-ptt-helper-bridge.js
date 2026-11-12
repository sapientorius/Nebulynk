import { createId } from '@paralleldrive/cuid2'
import { reactive } from 'vue'
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
import { browserPttHelperPlatform } from './ptt-helper-platform.js'

const HELPER_URL = 'ws://127.0.0.1:47641/ws'
const HELPER_PROTOCOL_VERSION = '2'
const PAIRING_TOKEN_KEY = 'nebulynk:ptt-helper:pairing-token'
const SESSION_ID_KEY = 'nebulynk:ptt-helper:session-id'
const ENABLED_KEY = 'nebulynk:ptt-helper:enabled'
const RECONNECT_BASE_MS = 750
const RECONNECT_MAX_MS = 10000

let socket = null
let reconnectTimer = null
let reconnectAttempt = 0
let initialized = false
let started = false
let currentRoute = '/'
let bridgeRouter = null
let routerCleanup = null
let settingsCleanup = null
let browserEventCleanup = []
let activeSocketSerial = 0
let heartbeatTimer = null
let protocolBlocked = false
let protocolReady = false
let manualRetryRequired = false
let socketPairingToken = null

export const browserPttHelperState = reactive({
  available: false,
  enabled: false,
  platform: null
})

function isBrowserHelperCandidate(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!targetWindow || isDesktopRuntime(targetWindow) || typeof WebSocket === 'undefined') {
    return false
  }

  return browserPttHelperPlatform(targetWindow.navigator) !== null
}

function getEnabledPreference() {
  try {
    return globalThis.localStorage?.getItem(ENABLED_KEY) === 'true'
  } catch {
    return false
  }
}

function setEnabledPreference(enabled) {
  try {
    const storage = globalThis.localStorage
    if (!storage) return
    if (enabled) {
      storage.setItem(ENABLED_KEY, 'true')
    } else {
      storage.removeItem(ENABLED_KEY)
    }
  } catch {
    // Ignore storage issues and keep the current runtime choice alive.
  }
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
  if (['binding-approval-required', 'binding-rejected'].includes(status?.reason)) return status.reason
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
  if (type !== 'hello' && type !== 'disconnect' && !nativePttState.authorized) return
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
  if (!status?.isGlobal || status?.reason === 'paused') micActivation.triggerExternalPttUp()
  micActivation.setDesktopPttBindingStatus(status || DEFAULT_DESKTOP_PTT_BINDING_STATUS)
  applyNativePttBindingStatus(status || DEFAULT_DESKTOP_PTT_BINDING_STATUS, {
    transport: 'browser-helper',
    helperState: helperStateFromStatus(status),
    ...overrides
  })
}

function resetUnavailableState(message = null) {
  micActivation.triggerExternalPttUp()
  micActivation.setDesktopPttBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS)
  resetNativePttState({
    transport: 'browser-helper',
    helperState: 'unavailable',
    lastError: message
  })
}

function scheduleReconnect() {
  if (!started || reconnectTimer || protocolBlocked || manualRetryRequired || !getPairingToken()) return
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

function compatibleHelper(payload) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(payload.helperVersion || '')
  return payload.protocolVersion === HELPER_PROTOCOL_VERSION && match && (Number(match[1]) > 0 || Number(match[2]) >= 4)
}

function waitForManualRetry(helperState, message = null) {
  manualRetryRequired = true
  protocolReady = false
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  applyBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS, { helperState, authorized: false,
    isTarget: false, targetSessionId: null, lastError: message })
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
      if (!compatibleHelper(payload)) { requireHelperUpdate(); break }
      protocolReady = true
      manualRetryRequired = false
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
      if (!compatibleHelper(payload)) { requireHelperUpdate(); break }
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
      if (!compatibleHelper(payload)) { requireHelperUpdate(); break }
      protocolReady = true
      if (typeof payload.pairingToken === 'string' && payload.pairingToken.trim()) {
        socketPairingToken = payload.pairingToken.trim()
        setPairingToken(socketPairingToken)
        manualRetryRequired = false
        reconnectAttempt = 0
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
      if (!protocolReady || !nativePttState.authorized) break
      applyBindingStatus(payload, {
        authorized: true
      })
      break
    case 'target_state':
      if (!protocolReady || !nativePttState.authorized) break
      if (!payload.isTarget) micActivation.triggerExternalPttUp()
      updateNativePttState({
        transport: 'browser-helper',
        helperState: helperStateFromStatus(nativePttState.bindingStatus),
        authorized: true,
        isTarget: payload.isTarget === true,
        targetSessionId: payload.targetSessionId || null
      })
      break
    case 'ptt_down':
      if (nativePttState.authorized && nativePttState.isTarget && nativePttState.bindingStatus.isGlobal) {
        micActivation.triggerExternalPttDown()
      }
      break
    case 'ptt_up':
      micActivation.triggerExternalPttUp()
      break
    case 'error': {
      if (payload.code === 'unsupported_protocol' || payload.message === 'Unsupported helper protocol version.') {
        requireHelperUpdate()
        break
      }
      if (['invalid_pairing_token', 'origin_revoked', 'pairing_rejected'].includes(payload.code)) {
        // Another tab may already have stored a newer token. Do not erase that credential.
        if (socketPairingToken && getPairingToken() === socketPairingToken) setPairingToken(null)
        waitForManualRetry(payload.code === 'pairing_rejected' ? 'pairing-rejected' : 'pairing-setup', payload.code)
        break
      }
      const blockedState = { pairing_mode_closed: 'pairing-mode-closed', pairing_expired: 'pairing-expired',
        helper_limited: 'helper-limited' }[payload.code]
      if (blockedState) { waitForManualRetry(blockedState, payload.code); break }
      updateNativePttState({ transport: 'browser-helper', lastError: payload.message || payload.code || 'helper_error' })
      break
    }
  }
}

function requireHelperUpdate() {
  protocolBlocked = true
  protocolReady = false
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  resetUnavailableState('helper_update_required')
  updateNativePttState({ helperState: 'update-required' })
  socket?.close()
}

function connect() {
  if (!started || !isBrowserHelperCandidate()) return
  if (isLiveSocket(socket)) return

  protocolReady = false
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
    socketPairingToken = getPairingToken()
    sendEnvelope('hello', {
      protocolVersion: HELPER_PROTOCOL_VERSION,
      origin: window.location.origin,
      sessionId: getSessionId(),
      clientKind: window.matchMedia?.('(display-mode: standalone)')?.matches ? 'pwa' : 'browser',
      pairingToken: socketPairingToken
    })
  })

  nextSocket.addEventListener('message', (event) => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    handleMessage(event)
  })
  nextSocket.addEventListener('error', () => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    if (!getPairingToken()) waitForManualRetry('connection-failed', 'helper_socket_error')
    else resetUnavailableState('helper_socket_error')
  })
  nextSocket.addEventListener('close', () => {
    if (socket !== nextSocket || socketSerial !== activeSocketSerial) return
    socket = null
    protocolReady = false
    if (!protocolBlocked && !manualRetryRequired) {
      if (!getPairingToken()) waitForManualRetry('connection-failed', 'helper_disconnected')
      else resetUnavailableState('helper_disconnected')
    }
    scheduleReconnect()
  })
}

function startBrowserPttHelperConnection() {
  if (!initialized || !isBrowserHelperCandidate() || started) {
    return
  }

  started = true
  protocolBlocked = false
  protocolReady = false
  currentRoute = bridgeRouter?.currentRoute?.value?.fullPath || currentBrowserRoute()
  resetNativePttState({
    transport: 'browser-helper',
    helperState: 'idle'
  })

  if (bridgeRouter) {
    routerCleanup?.()
    routerCleanup = bridgeRouter.afterEach((to) => {
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

  if (getPairingToken()) connect()
  else { manualRetryRequired = true; updateNativePttState({ helperState: 'pairing-setup' }) }
}

function stopBrowserPttHelperConnection() {
  started = false
  protocolReady = false
  manualRetryRequired = false
  socketPairingToken = null
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

  micActivation.triggerExternalPttUp()
  sendEnvelope('disconnect')
  activeSocketSerial += 1
  socket?.close()
  socket = null
  reconnectAttempt = 0
  micActivation.setDesktopPttBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS)
  resetNativePttState()
}

export function initializeBrowserPttHelperBridge({ router } = {}) {
  const available = isBrowserHelperCandidate()
  browserPttHelperState.available = available
  browserPttHelperState.platform = available ? browserPttHelperPlatform(window.navigator) : null

  if (!available) {
    browserPttHelperState.enabled = false
    return () => {}
  }

  bridgeRouter = router || bridgeRouter
  currentRoute = bridgeRouter?.currentRoute?.value?.fullPath || currentBrowserRoute()

  if (!initialized) {
    initialized = true
    browserPttHelperState.enabled = getEnabledPreference()
  }

  if (browserPttHelperState.enabled) {
    startBrowserPttHelperConnection()
  }

  return () => {
    stopBrowserPttHelperConnection()
    initialized = false
    bridgeRouter = null
    browserPttHelperState.available = false
    browserPttHelperState.platform = null
    browserPttHelperState.enabled = false
  }
}

export function enableBrowserPttHelper() {
  if (!isBrowserHelperCandidate()) {
    browserPttHelperState.available = false
    browserPttHelperState.enabled = false
    return false
  }

  if (!initialized) {
    initializeBrowserPttHelperBridge()
  }

  browserPttHelperState.available = true
  browserPttHelperState.enabled = true
  setEnabledPreference(true)
  startBrowserPttHelperConnection()
  retryBrowserPttHelper()
  return true
}

export function disableBrowserPttHelper() {
  browserPttHelperState.enabled = false
  setEnabledPreference(false)
  stopBrowserPttHelperConnection()
}

export function retryBrowserPttHelper() {
  if (!started || !browserPttHelperState.enabled || isLiveSocket(socket)) return
  manualRetryRequired = false
  protocolBlocked = false
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  connect()
}
