import { reactive } from 'vue'
import { invokeDesktop, listenDesktop, openServerManager as openDesktopServerManager } from './desktop-bridge.js'
import { updateDesktopWindowState } from './desktop-window-state.js'
import {
  DEFAULT_DESKTOP_PTT_BINDING_STATUS,
  normalizeDesktopPttBindingStatus
} from './desktop-ptt-shortcut.js'
import {
  applyNativePttBindingStatus,
  resetNativePttState
} from './native-ptt-state.js'
import * as micActivation from './mic-activation.js'
import {
  getDesktopRuntimeKind,
  isDesktopDiagnosticsEnabled,
  isDesktopWorkspaceWindow
} from './runtime.js'

function normalizeRoute(route) {
  if (typeof route !== 'string') return '/channels'
  const trimmed = route.trim()
  if (!trimmed) return '/channels'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeNotificationPreferences(notificationPreferences) {
  if (!notificationPreferences || typeof notificationPreferences !== 'object') {
    return {
      enabled: true,
      permission: 'default'
    }
  }

  const permission = typeof notificationPreferences.permission === 'string'
    ? notificationPreferences.permission.trim()
    : 'default'

  return {
    enabled: notificationPreferences.enabled !== false,
    permission: permission || 'default'
  }
}

function cloneDesktopSerializableValue(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return fallback
  }
}

function normalizeAuthState(authState) {
  if (!authState || typeof authState !== 'object') {
    return {
      accessToken: null,
      refreshToken: null,
      csrfToken: null,
      sessionTransport: 'body',
      user: null
    }
  }

  return {
    accessToken: typeof authState.accessToken === 'string' ? authState.accessToken : null,
    refreshToken: typeof authState.refreshToken === 'string' ? authState.refreshToken : null,
    csrfToken: typeof authState.csrfToken === 'string' ? authState.csrfToken : null,
    sessionTransport: authState.sessionTransport === 'cookie' ? 'cookie' : 'body',
    user: cloneDesktopSerializableValue(authState.user, null)
  }
}

function normalizePttConfig(pttConfig) {
  if (!pttConfig || typeof pttConfig !== 'object') {
    return {
      mode: 'live',
      pttKey: 'Space'
    }
  }

  return {
    mode: pttConfig.mode === 'ptt' || pttConfig.mode === 'vad' ? pttConfig.mode : 'live',
    pttKey: typeof pttConfig.pttKey === 'string' && pttConfig.pttKey.trim()
      ? pttConfig.pttKey.trim()
      : 'Space'
  }
}

function applyWindowState(payload = {}) {
  updateDesktopWindowState(payload)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nebulynk:desktop-window-state', {
      detail: payload
    }))
  }
}

export const desktopWorkspaceState = reactive({
  ready: false,
  profileId: null,
  baseUrl: '',
  route: '/channels',
  authState: normalizeAuthState(null),
  notificationPreferences: normalizeNotificationPreferences(null),
  pttConfig: normalizePttConfig(null),
  pttBindingStatus: normalizeDesktopPttBindingStatus(DEFAULT_DESKTOP_PTT_BINDING_STATUS)
})

let bridgeInitialized = false
let bridgeRouter = null
let stopRouterHook = null
let isApplyingDesktopPttConfig = false

function logDesktopWorkspaceDiagnostic(message, payload) {
  if (!isDesktopDiagnosticsEnabled()) return
  if (payload === undefined) {
    console.log(message)
    return
  }
  console.log(message, payload)
}

function pttConfigsEqual(a, b) {
  const normalizedA = normalizePttConfig(a)
  const normalizedB = normalizePttConfig(b)
  return normalizedA.mode === normalizedB.mode
    && normalizedA.pttKey === normalizedB.pttKey
}

function applyDesktopPttConfigToMicActivation(pttConfig = {}) {
  const normalizedPttConfig = normalizePttConfig(pttConfig)
  const currentMode = micActivation.getMode()
  const currentPttKey = micActivation.getPttKey()

  if (currentMode === normalizedPttConfig.mode && currentPttKey === normalizedPttConfig.pttKey) {
    return normalizedPttConfig
  }

  isApplyingDesktopPttConfig = true
  try {
    if (currentMode !== normalizedPttConfig.mode) {
      micActivation.setMode(normalizedPttConfig.mode)
    }
    if (currentPttKey !== normalizedPttConfig.pttKey) {
      micActivation.setPttKey(normalizedPttConfig.pttKey)
    }
  } finally {
    isApplyingDesktopPttConfig = false
  }

  return normalizedPttConfig
}

function applyWorkspaceSnapshot(snapshot = {}) {
  desktopWorkspaceState.profileId = typeof snapshot.profileId === 'string' ? snapshot.profileId : null
  desktopWorkspaceState.baseUrl = typeof snapshot.baseUrl === 'string' ? snapshot.baseUrl : ''
  desktopWorkspaceState.route = normalizeRoute(snapshot.route)
  desktopWorkspaceState.authState = normalizeAuthState(snapshot.authState)
  desktopWorkspaceState.notificationPreferences = normalizeNotificationPreferences(snapshot.notificationPreferences)
  desktopWorkspaceState.pttConfig = normalizePttConfig(snapshot.pttConfig)
  applyDesktopPttConfigToMicActivation(desktopWorkspaceState.pttConfig)
  desktopWorkspaceState.pttBindingStatus = normalizeDesktopPttBindingStatus(snapshot.pttBindingStatus)
  micActivation.setDesktopPttBindingStatus(desktopWorkspaceState.pttBindingStatus)
  applyNativePttBindingStatus(desktopWorkspaceState.pttBindingStatus, {
    transport: 'desktop',
    helperState: desktopWorkspaceState.pttBindingStatus.mode === 'unsupported' ? 'unsupported' : 'connected',
    authorized: true,
    isTarget: true,
    targetSessionId: desktopWorkspaceState.profileId
  })
  desktopWorkspaceState.ready = true
}

function maybeNavigateToRoute(route) {
  if (!bridgeRouter || !route) return
  const normalizedRoute = normalizeRoute(route)
  if (bridgeRouter.currentRoute?.value?.fullPath === normalizedRoute) return
  bridgeRouter.push(normalizedRoute).catch(() => {})
}

async function ensureBridgeListeners() {
  if (!isDesktopWorkspaceWindow() || bridgeInitialized) return
  bridgeInitialized = true

  await listenDesktop('desktop:profile-activated', (payload) => {
    applyWorkspaceSnapshot(payload || {})
  })

  await listenDesktop('desktop:notification-open', (payload) => {
    const normalizedRoute = normalizeRoute(payload?.route)
    desktopWorkspaceState.route = normalizedRoute
    maybeNavigateToRoute(normalizedRoute)
  })

  await listenDesktop('desktop:window-state', (payload) => {
    applyWindowState(payload || {})
  })

  await listenDesktop('desktop:ptt-down', () => {
    micActivation.triggerExternalPttDown()
  })

  await listenDesktop('desktop:ptt-up', () => {
    micActivation.triggerExternalPttUp()
  })

  await listenDesktop('desktop:ptt-binding-status-changed', (payload) => {
    desktopWorkspaceState.pttBindingStatus = normalizeDesktopPttBindingStatus(payload)
    micActivation.setDesktopPttBindingStatus(desktopWorkspaceState.pttBindingStatus)
    applyNativePttBindingStatus(desktopWorkspaceState.pttBindingStatus, {
      transport: 'desktop',
      helperState: desktopWorkspaceState.pttBindingStatus.mode === 'unsupported' ? 'unsupported' : 'connected',
      authorized: true,
      isTarget: true,
      targetSessionId: desktopWorkspaceState.profileId
    })
  })
}

export async function initializeDesktopWorkspaceBridge() {
  if (!isDesktopWorkspaceWindow()) return null
  await ensureBridgeListeners()
  const snapshot = await invokeDesktop('desktop_get_active_profile_snapshot').catch(() => null)
  logDesktopWorkspaceDiagnostic('[desktop-workspace-bridge:init]', {
    runtime: getDesktopRuntimeKind(),
    profileId: snapshot?.profileId || null,
    pttConfig: normalizePttConfig(snapshot?.pttConfig)
  })
  applyWorkspaceSnapshot(snapshot || {})
  return snapshot
}

export function startDesktopWorkspaceBridge({ router } = {}) {
  if (!isDesktopWorkspaceWindow()) {
    return () => {}
  }

  logDesktopWorkspaceDiagnostic('[desktop-workspace-bridge:start]', {
    runtime: getDesktopRuntimeKind(),
    route: router?.currentRoute?.value?.fullPath || desktopWorkspaceState.route,
    pttConfig: normalizePttConfig(desktopWorkspaceState.pttConfig)
  })

  bridgeRouter = router || null
  if (bridgeRouter) {
    stopRouterHook?.()
    stopRouterHook = bridgeRouter.afterEach((to) => {
      syncDesktopWorkspaceRoute(to?.fullPath || '/channels').catch(() => {})
    })
  }

  applyDesktopPttConfigToMicActivation(desktopWorkspaceState.pttConfig)

  let initialPttSnapshotSeen = false
  const unsubscribeMicSettings = micActivation.subscribeToSettings((snapshot) => {
    const nextPttConfig = normalizePttConfig({
      mode: snapshot.mode,
      pttKey: snapshot.pttKey
    })

    if (isApplyingDesktopPttConfig) {
      return
    }

    if (!initialPttSnapshotSeen) {
      initialPttSnapshotSeen = true
      if (!pttConfigsEqual(nextPttConfig, desktopWorkspaceState.pttConfig)) {
        logDesktopWorkspaceDiagnostic('[desktop-workspace-bridge:ptt-sync-skip]', {
          reason: 'initial-default-mismatch',
          current: nextPttConfig,
          desktop: normalizePttConfig(desktopWorkspaceState.pttConfig)
        })
        return
      }
    }

    if (pttConfigsEqual(nextPttConfig, desktopWorkspaceState.pttConfig)) {
      return
    }

    syncDesktopWorkspacePttConfig(nextPttConfig).catch(() => {})
  })

  syncDesktopWorkspaceRoute(router?.currentRoute?.value?.fullPath || desktopWorkspaceState.route).catch(() => {})

  return () => {
    stopRouterHook?.()
    stopRouterHook = null
    bridgeRouter = null
    unsubscribeMicSettings?.()
    resetNativePttState()
  }
}

export function getDesktopWorkspaceInitialAuthState() {
  return normalizeAuthState(desktopWorkspaceState.authState)
}

export function getDesktopWorkspaceProfileContext() {
  return {
    profileId: typeof desktopWorkspaceState.profileId === 'string'
      ? desktopWorkspaceState.profileId
      : null,
    baseUrl: typeof desktopWorkspaceState.baseUrl === 'string'
      ? desktopWorkspaceState.baseUrl
      : '',
    route: normalizeRoute(desktopWorkspaceState.route)
  }
}

export function getDesktopWorkspaceNotificationState() {
  return {
    enabled: desktopWorkspaceState.notificationPreferences.enabled !== false,
    permission: desktopWorkspaceState.notificationPreferences.permission || 'default'
  }
}

export async function syncDesktopWorkspaceSession(authState = {}) {
  if (!isDesktopWorkspaceWindow()) return
  const nextAuthState = normalizeAuthState({
    ...desktopWorkspaceState.authState,
    ...authState
  })
  desktopWorkspaceState.authState = nextAuthState
  await invokeDesktop('desktop_sync_active_session', {
    authState: nextAuthState
  })
}

export async function syncDesktopWorkspaceRoute(route) {
  if (!isDesktopWorkspaceWindow()) return
  const normalizedRoute = normalizeRoute(route)
  desktopWorkspaceState.route = normalizedRoute
  await invokeDesktop('desktop_sync_active_route', {
    route: normalizedRoute
  })
}

export async function syncDesktopWorkspaceNotificationPreferences(notificationPreferences = {}) {
  if (!isDesktopWorkspaceWindow()) return
  const nextNotificationPreferences = normalizeNotificationPreferences({
    ...desktopWorkspaceState.notificationPreferences,
    ...notificationPreferences
  })
  desktopWorkspaceState.notificationPreferences = nextNotificationPreferences
  await invokeDesktop('desktop_sync_active_notification_preferences', {
    notificationPreferences: nextNotificationPreferences
  })
}

export async function syncDesktopWorkspacePttConfig(pttConfig = {}) {
  if (!isDesktopWorkspaceWindow()) {
    console.warn('[ptt-sync:error]', {
      reason: 'not-desktop-workspace',
      pttConfig
    })
    return
  }
  const nextPttConfig = normalizePttConfig({
    ...desktopWorkspaceState.pttConfig,
    ...pttConfig
  })
  if (pttConfigsEqual(nextPttConfig, desktopWorkspaceState.pttConfig)) {
    return
  }
  logDesktopWorkspaceDiagnostic('[desktop-workspace-bridge:ptt-sync]', {
    runtime: getDesktopRuntimeKind(),
    pttConfig: nextPttConfig
  })
  try {
    await invokeDesktop('desktop_sync_active_ptt_config', {
      pttConfig: nextPttConfig
    })
    desktopWorkspaceState.pttConfig = nextPttConfig
  } catch (error) {
    console.error('[ptt-sync:error]', {
      reason: 'invoke-failed',
      message: error?.message || String(error),
      pttConfig: nextPttConfig
    })
    throw error
  }
}

export async function signalDesktopWorkspaceLogout() {
  if (!isDesktopWorkspaceWindow()) return
  const nextAuthState = normalizeAuthState(null)
  desktopWorkspaceState.authState = nextAuthState
  await invokeDesktop('desktop_sync_active_session', {
    authState: nextAuthState
  })
}

export async function requestDesktopWorkspaceNotificationPermission() {
  if (!isDesktopWorkspaceWindow()) return 'default'
  const permission = await invokeDesktop('desktop_request_notification_permission').catch(() => 'denied')
  const nextNotificationPreferences = normalizeNotificationPreferences({
    ...desktopWorkspaceState.notificationPreferences,
    permission
  })
  desktopWorkspaceState.notificationPreferences = nextNotificationPreferences
  return permission
}

export async function openDesktopWorkspaceServerManager() {
  if (!isDesktopWorkspaceWindow()) return
  await openDesktopServerManager().catch(() => {})
}
