import { showDesktopNativeNotification } from './desktop-notification-plugin.js'
import { getDesktopRuntimeKind, isDesktopRuntime } from './runtime.js'

const ELECTRON_COMMAND_MAP = Object.freeze({
  desktop_load_state: 'loadState',
  desktop_save_state: 'saveState',
  desktop_get_active_profile_snapshot: 'getActiveProfileSnapshot',
  desktop_activate_profile: 'activateProfile',
  desktop_sync_active_session: 'syncActiveSession',
  desktop_sync_active_route: 'syncActiveRoute',
  desktop_sync_active_notification_preferences: 'syncActiveNotificationPreferences',
  desktop_sync_active_ptt_config: 'syncActivePttConfig',
  desktop_open_server_manager: 'openServerManager',
  desktop_show_main_window: 'showMainWindow',
  desktop_get_notification_permission: 'getNotificationPermission',
  desktop_request_notification_permission: 'requestNotificationPermission',
  desktop_show_notification: 'showNotification',
  desktop_set_ptt_binding: 'setPttBinding'
})

function getElectronDesktopApi() {
  if (typeof window === 'undefined') return null
  return getDesktopRuntimeKind() === 'electron' ? window.nebulynkDesktop || null : null
}

async function importCoreApi() {
  if (!isDesktopRuntime()) return null
  return import('@tauri-apps/api/core')
}

async function importEventApi() {
  if (!isDesktopRuntime()) return null
  return import('@tauri-apps/api/event')
}

export async function invokeDesktop(command, payload = {}) {
  if (!isDesktopRuntime()) return null

  const electronApi = getElectronDesktopApi()
  const electronMethodName = ELECTRON_COMMAND_MAP[command]
  if (electronApi && electronMethodName && typeof electronApi[electronMethodName] === 'function') {
    return electronApi[electronMethodName](payload)
  }

  const core = await importCoreApi()
  if (!core) return null
  return core.invoke(command, payload)
}

export async function listenDesktop(eventName, handler) {
  const electronApi = getElectronDesktopApi()
  if (electronApi) {
    return electronApi.listen(eventName, handler)
  }

  const eventApi = await importEventApi()
  if (!eventApi) {
    return () => {}
  }

  const unlisten = await eventApi.listen(eventName, (event) => {
    handler(event.payload)
  })
  return unlisten
}

export async function emitDesktop(eventName, payload = {}) {
  const electronApi = getElectronDesktopApi()
  if (electronApi && typeof electronApi.emit === 'function') {
    await electronApi.emit(eventName, payload)
    return
  }

  const eventApi = await importEventApi()
  if (!eventApi) return
  await eventApi.emit(eventName, payload)
}

export async function loadDesktopState() {
  const payload = await invokeDesktop('desktop_load_state')
  if (!payload || typeof payload !== 'object') {
    return {
      activeProfileId: null,
      profiles: []
    }
  }

  return {
    activeProfileId: typeof payload.activeProfileId === 'string' ? payload.activeProfileId : null,
    profiles: Array.isArray(payload.profiles) ? payload.profiles : []
  }
}

export async function saveDesktopState(state) {
  if (!isDesktopRuntime()) return
  await invokeDesktop('desktop_save_state', { state })
}

export async function getActiveDesktopProfileSnapshot() {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_get_active_profile_snapshot')
}

export async function activateDesktopProfile(profileId = null, route = null) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_activate_profile', {
    profileId: typeof profileId === 'string' ? profileId : null,
    route: typeof route === 'string' ? route : null
  })
}

export async function syncActiveDesktopSession(authState = {}) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_sync_active_session', { authState })
}

export async function syncActiveDesktopRoute(route) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_sync_active_route', {
    route: typeof route === 'string' ? route : null
  })
}

export async function syncActiveDesktopNotificationPreferences(notificationPreferences = {}) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_sync_active_notification_preferences', { notificationPreferences })
}

export async function syncActiveDesktopPttConfig(pttConfig = {}) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_sync_active_ptt_config', { pttConfig })
}

export async function openServerManager() {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_open_server_manager')
}

export async function showDesktopNotification(payload) {
  if (!isDesktopRuntime()) return false
  return showDesktopNativeNotification(payload).catch(() => false)
}

export async function revealDesktopWindow() {
  if (!isDesktopRuntime()) return
  await invokeDesktop('desktop_show_main_window')
}

export async function setDesktopPttBinding(binding = {}) {
  if (!isDesktopRuntime()) return null
  return invokeDesktop('desktop_set_ptt_binding', {
    binding
  })
}
