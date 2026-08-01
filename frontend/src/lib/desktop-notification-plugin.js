import { addPluginListener, invoke } from '@tauri-apps/api/core'
import {
  isDesktopDiagnosticsEnabled,
  isDesktopRuntime,
  isElectronDesktopRuntime
} from './runtime.js'
import { listenDesktop } from './desktop-bridge.js'

const NOTIFICATION_PLUGIN = 'notification'
const NOTIFICATION_ACTION_EVENT = 'action'
const notificationTargetsById = new Map()
let nextNotificationId = Date.now()
const ELECTRON_NOTIFICATION_COMMAND_MAP = Object.freeze({
  desktop_get_notification_permission: 'getNotificationPermission',
  desktop_request_notification_permission: 'requestNotificationPermission',
  desktop_show_notification: 'showNotification'
})

function logDesktopNotificationPluginDiagnostic(message, payload) {
  if (!isDesktopDiagnosticsEnabled()) return
  if (payload === undefined) {
    console.log(message)
    return
  }

  try {
    console.log(`${message} ${JSON.stringify(payload)}`)
  } catch {
    console.log(message)
  }
}

function getElectronDesktopApi() {
  if (typeof window === 'undefined') return null
  return isElectronDesktopRuntime() ? window.nebulynkDesktop || null : null
}

function normalizeNotificationPermission(value) {
  if (value === 'granted' || value === 'denied' || value === 'prompt' || value === 'prompt-with-rationale') {
    return value
  }
  return 'default'
}

function normalizeRoute(route) {
  if (typeof route !== 'string') return '/channels'
  const trimmed = route.trim()
  if (!trimmed) return '/channels'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeServerId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeNotificationId(value) {
  if (!Number.isFinite(Number(value))) return null
  return Math.trunc(Number(value))
}

function extractNotificationPayload(source) {
  if (!source || typeof source !== 'object') {
    return {
      id: null,
      serverId: null,
      route: '/channels',
      actionId: null
    }
  }

  const notification = source.notification && typeof source.notification === 'object'
    ? source.notification
    : source
  const extra = notification.extra && typeof notification.extra === 'object'
    ? notification.extra
    : {}
  const data = notification.data && typeof notification.data === 'object'
    ? notification.data
    : {}

  return {
    id: normalizeNotificationId(source.id ?? notification.id),
    serverId: normalizeServerId(
      source.serverId
      ?? notification.serverId
      ?? extra.serverId
      ?? data.serverId
    ),
    route: normalizeRoute(
      source.route
      ?? notification.route
      ?? extra.route
      ?? data.route
    ),
    actionId: typeof source.actionId === 'string'
      ? source.actionId
      : typeof notification.actionId === 'string'
        ? notification.actionId
        : null
  }
}

async function invokeDesktopNotification(command, args = {}) {
  if (!isDesktopRuntime()) return null

  const electronApi = getElectronDesktopApi()
  const electronMethodName = ELECTRON_NOTIFICATION_COMMAND_MAP[command]
  if (electronApi && electronMethodName && typeof electronApi[electronMethodName] === 'function') {
    return electronApi[electronMethodName](args)
  }

  return invoke(command, args)
}

export async function getDesktopNotificationPermission() {
  const permission = await invokeDesktopNotification('desktop_get_notification_permission')
    .catch(() => 'default')
  return normalizeNotificationPermission(permission)
}

export async function requestDesktopNotificationPermission() {
  const permission = await invokeDesktopNotification('desktop_request_notification_permission')
    .catch(() => 'denied')
  return normalizeNotificationPermission(permission)
}

export async function showDesktopNativeNotification(payload = {}) {
  if (!isDesktopRuntime()) return false
  const notificationId = normalizeNotificationId(payload.id) || nextNotificationId++
  notificationTargetsById.set(notificationId, {
    serverId: normalizeServerId(payload.serverId),
    route: normalizeRoute(payload.route)
  })
  const normalizedPayload = {
    id: notificationId,
    title: payload.title || 'Nebulynk',
    body: payload.body || '',
    serverId: normalizeServerId(payload.serverId),
    route: normalizeRoute(payload.route),
    tag: payload.serverId ? `nebulynk-${payload.serverId}` : 'nebulynk-desktop'
  }

  try {
    await invokeDesktopNotification('desktop_show_notification', {
      payload: normalizedPayload
    })
    return true
  } catch (error) {
    logDesktopNotificationPluginDiagnostic('[desktop-notify:invoke:error]', {
      command: 'desktop_show_notification',
      notificationId,
      message: error?.message || String(error)
    })
    notificationTargetsById.delete(notificationId)
    throw error
  }
}

export async function listenDesktopNotificationActions(handler) {
  if (!isDesktopRuntime()) return () => {}

  if (isElectronDesktopRuntime()) {
    return listenDesktop('desktop:notification-action', (payload) => {
      const target = extractNotificationPayload(payload)
      if (!target.serverId) return
      handler(target)
    })
  }

  const listener = await addPluginListener(
    NOTIFICATION_PLUGIN,
    NOTIFICATION_ACTION_EVENT,
    (payload) => {
      const actionPayload = extractNotificationPayload(payload)
      const mappedTarget = actionPayload.id !== null
        ? notificationTargetsById.get(actionPayload.id) || null
        : null
      if (actionPayload.id !== null) {
        notificationTargetsById.delete(actionPayload.id)
      }
      const target = {
        ...actionPayload,
        serverId: mappedTarget?.serverId || actionPayload.serverId,
        route: mappedTarget?.route || actionPayload.route
      }
      if (!target.serverId) return
      handler(target)
    }
  ).catch(() => null)

  return () => {
    listener?.unregister?.().catch(() => {})
  }
}
