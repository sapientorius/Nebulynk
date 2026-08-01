import { watch } from 'vue'
import { createApiClient } from './api-client.js'
import { createSocketClient } from './socket-client.js'
import { showDesktopNotification } from './desktop-bridge.js'
import { playSfx, SFX_EVENTS } from './sfx.js'
import {
  buildDesktopNotificationRoute
} from './desktop-notification-route.js'
import { resolveDesktopApiBaseUrl } from './desktop-server-url.js'
import {
  desktopState,
  getDesktopProfileById,
  updateDesktopProfileNotificationState,
  updateDesktopProfileSession
} from './desktop-runtime.js'

const RELAY_REFRESH_INTERVAL_MS = 45_000
const MEETING_INDEX_REFRESH_INTERVAL_MS = 120_000

const relayEntries = new Map()
let stopRelayWatch = null

function createRelayEntry(profile) {
  const deliveredNotificationIds = new Set()
  const meetingByChatChannelId = {}
  const apiClient = createApiClient({
    baseUrl: resolveDesktopApiBaseUrl(profile.baseUrl),
    defaultSessionTransport: 'body',
    initialAuthState: profile.authState,
    persistCsrfToStorage: false,
    redirectOnAuthFailure: false,
    onPersistAuthState: async (authState) => {
      await updateDesktopProfileSession(profile.id, authState)
    }
  })
  const socketClient = createSocketClient({ apiClient })
  const cleanupCallbacks = []
  let refreshTimerId = null
  let meetingIndexTimerId = null

  async function refreshNotificationState() {
    try {
      const { data } = await apiClient.http.get('/notifications', {
        params: { $limit: 5 }
      })
      const notifications = Array.isArray(data?.data) ? data.data : []
      const unreadCount = Number.isInteger(data?.unread_total)
        ? data.unread_total
        : notifications.filter((notification) => !notification.is_read).length
      const lastNotificationId = notifications[0]?.id || null
      await updateDesktopProfileNotificationState(profile.id, {
        unreadCount,
        lastNotificationId
      })
      for (const notification of notifications) {
        if (notification?.id) {
          deliveredNotificationIds.add(notification.id)
        }
      }
    } catch {
      // Best effort only.
    }
  }

  async function refreshMeetingIndex() {
    try {
      const { data } = await apiClient.http.get('/meetings', {
        params: {
          include_ended: true,
          $limit: 100
        }
      })
      const meetings = Array.isArray(data?.data) ? data.data : []
      for (const key of Object.keys(meetingByChatChannelId)) {
        delete meetingByChatChannelId[key]
      }
      for (const meeting of meetings) {
        if (!meeting?.chat_channel_id || !meeting?.id) continue
        meetingByChatChannelId[meeting.chat_channel_id] = meeting.id
      }
    } catch {
      // Best effort only.
    }
  }

  async function maybeNotify(notification) {
    if (!notification?.id || deliveredNotificationIds.has(notification.id)) return
    deliveredNotificationIds.add(notification.id)

    const latestProfile = getDesktopProfileById(profile.id)
    if (latestProfile?.notificationPreferences?.enabled === false) {
      return
    }

    const unreadCount = Number(latestProfile?.notificationState?.unreadCount || 0) + 1
    await updateDesktopProfileNotificationState(profile.id, {
      unreadCount,
      lastNotificationId: notification.id
    })

    const isBackgroundProfile = desktopState.activeProfileId !== profile.id
    const shouldShowNativeNotification = isBackgroundProfile || document.visibilityState !== 'visible'
    if (!shouldShowNativeNotification) return

    const route = buildDesktopNotificationRoute({
      notification,
      meetingByChatChannelId
    })

    await showDesktopNotification({
      title: notification.actor_display_name || 'Nebulynk',
      body: notification.message_snippet || '',
      serverId: profile.id,
      route
    }).catch(() => {})
    playSfx(SFX_EVENTS.NOTIFICATION)
  }

  function onNotificationCreated(notification) {
    maybeNotify(notification).catch(() => {})
  }

  function startTimers() {
    refreshTimerId = setInterval(() => {
      refreshNotificationState().catch(() => {})
    }, RELAY_REFRESH_INTERVAL_MS)
    meetingIndexTimerId = setInterval(() => {
      refreshMeetingIndex().catch(() => {})
    }, MEETING_INDEX_REFRESH_INTERVAL_MS)
  }

  function clearTimers() {
    if (refreshTimerId) {
      clearInterval(refreshTimerId)
      refreshTimerId = null
    }
    if (meetingIndexTimerId) {
      clearInterval(meetingIndexTimerId)
      meetingIndexTimerId = null
    }
  }

  function attachSocketListeners(socket) {
    if (!socket) return
    if (socket.__nebulynkDesktopRelayBound) return
    socket.__nebulynkDesktopRelayBound = true

    const notificationHandler = (notification) => {
      onNotificationCreated(notification)
    }
    const messageHandler = (message) => {
      if (message?.type === 'notifications created') {
        onNotificationCreated(message.data)
      }
    }
    const meetingRefreshHandler = () => {
      refreshMeetingIndex().catch(() => {})
    }

    socket.on('notifications created', notificationHandler)
    socket.on('message', messageHandler)
    socket.on('meetings created', meetingRefreshHandler)
    socket.on('meetings invited', meetingRefreshHandler)
    socket.on('meetings ended', meetingRefreshHandler)

    cleanupCallbacks.push(() => socket.off('notifications created', notificationHandler))
    cleanupCallbacks.push(() => socket.off('message', messageHandler))
    cleanupCallbacks.push(() => socket.off('meetings created', meetingRefreshHandler))
    cleanupCallbacks.push(() => socket.off('meetings invited', meetingRefreshHandler))
    cleanupCallbacks.push(() => socket.off('meetings ended', meetingRefreshHandler))
  }

  async function start() {
    await Promise.all([
      refreshNotificationState(),
      refreshMeetingIndex()
    ])
    startTimers()

    socketClient.subscribeToSocketAuthenticated((socket) => {
      attachSocketListeners(socket)
      refreshNotificationState().catch(() => {})
      refreshMeetingIndex().catch(() => {})
    })
    socketClient.connectSocket()
  }

  function stop() {
    clearTimers()
    for (const callback of cleanupCallbacks.splice(0)) {
      callback()
    }
    socketClient.destroy()
  }

  return {
    start,
    stop
  }
}

async function syncRelayEntries() {
  const backgroundProfiles = desktopState.profiles.filter((profile) => (
    profile.id !== desktopState.activeProfileId
    && typeof profile.authState?.accessToken === 'string'
    && profile.authState.accessToken.length > 0
    && profile.notificationPreferences?.enabled !== false
  ))
  const allowedIds = new Set(backgroundProfiles.map((profile) => profile.id))

  for (const [profileId, entry] of relayEntries.entries()) {
    if (allowedIds.has(profileId)) continue
    entry.stop()
    relayEntries.delete(profileId)
  }

  for (const profile of backgroundProfiles) {
    if (relayEntries.has(profile.id)) continue
    const entry = createRelayEntry(profile)
    relayEntries.set(profile.id, entry)
    await entry.start()
  }
}

export function startDesktopBackgroundRelay() {
  if (stopRelayWatch) return

  stopRelayWatch = watch(
    () => desktopState.profiles.map((profile) => ({
      id: profile.id,
      accessToken: profile.authState?.accessToken || null,
      baseUrl: profile.baseUrl,
      notificationsEnabled: profile.notificationPreferences?.enabled !== false,
      active: desktopState.activeProfileId === profile.id
    })),
    () => {
      syncRelayEntries().catch(() => {})
    },
    {
      deep: true,
      immediate: true
    }
  )
}

export function stopDesktopBackgroundRelay() {
  stopRelayWatch?.()
  stopRelayWatch = null
  for (const entry of relayEntries.values()) {
    entry.stop()
  }
  relayEntries.clear()
}
