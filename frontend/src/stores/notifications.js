import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import {
  getDesktopWorkspaceNotificationState,
  requestDesktopWorkspaceNotificationPermission,
  syncDesktopWorkspaceNotificationPreferences
} from '../lib/desktop-workspace-bridge.js'
import { getDesktopNotificationPermission, requestDesktopNotificationPermission } from '../lib/desktop-notification-plugin.js'
import { getActiveDesktopProfile, updateDesktopProfileNotificationPreferences } from '../lib/desktop-runtime.js'
import { t } from '../lib/i18n.js'
import { waitForAppServiceWorkerReady } from '../lib/pwa.js'
import { isAnyDesktopRuntime, isDesktopRuntime, isDesktopWorkspaceWindow } from '../lib/runtime.js'
import { useChannelsStore } from './channels.js'

const UNREAD_COUNTS_FRESHNESS_MS = 30_000

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function getBrowserNotificationPermission() {
  return typeof Notification !== 'undefined'
    ? Notification.permission
    : 'default'
}

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref([])
  const unreadCount = ref(0)
  const pushEnabled = ref(false)
  const pushSubscriptionId = ref(null)
  const notificationPermission = ref('default')
  const showPanel = ref(false)
  const usesDesktopNotificationRuntime = computed(() => isAnyDesktopRuntime())
  const unreadCounts = computed(() => useChannelsStore().unreadCounts)
  const canToggleNotifications = computed(() => {
    if (isDesktopWorkspaceWindow()) return true
    if (!isDesktopRuntime()) return true
    return !!getActiveDesktopProfile()
  })
  const notificationDeliveryState = computed(() => ({
    runtime: usesDesktopNotificationRuntime.value ? 'desktop' : 'browser',
    enabled: pushEnabled.value,
    permission: notificationPermission.value,
    pushSubscriptionId: pushSubscriptionId.value
  }))
  const pendingAutoReadKeys = new Set()
  const pendingAutoReadMessageIds = new Set()
  const lastUnreadCountsRefreshAt = ref(0)
  let unreadCountsRefreshPromise = null

  function reset() {
    notifications.value = []
    unreadCount.value = 0
    pushEnabled.value = false
    pushSubscriptionId.value = null
    notificationPermission.value = 'default'
    showPanel.value = false
    lastUnreadCountsRefreshAt.value = 0
    unreadCountsRefreshPromise = null
    pendingAutoReadKeys.clear()
    pendingAutoReadMessageIds.clear()
  }

  async function persistDesktopNotificationPreferences(patch = {}) {
    if (isDesktopWorkspaceWindow()) {
      await syncDesktopWorkspaceNotificationPreferences(patch)
      return
    }

    const activeProfile = getActiveDesktopProfile()
    if (!activeProfile) return
    await updateDesktopProfileNotificationPreferences(activeProfile.id, patch)
  }

  async function syncNotificationState() {
    if (isDesktopWorkspaceWindow()) {
      const desktopState = getDesktopWorkspaceNotificationState()
      pushEnabled.value = desktopState.enabled !== false
      pushSubscriptionId.value = null
      notificationPermission.value = desktopState.permission || 'default'
      return
    }

    if (isDesktopRuntime()) {
      const activeProfile = getActiveDesktopProfile()
      const savedPreferences = activeProfile?.notificationPreferences || {
        enabled: true,
        permission: 'default'
      }
      const permission = await getDesktopNotificationPermission()
        .catch(() => savedPreferences.permission || 'default')

      pushEnabled.value = savedPreferences.enabled !== false
      pushSubscriptionId.value = null
      notificationPermission.value = permission
      if (activeProfile) {
        await updateDesktopProfileNotificationPreferences(activeProfile.id, {
          permission
        }).catch(() => {})
      }
      return
    }

    const savedPushId = localStorage.getItem('pushSubscriptionId')
    pushEnabled.value = !!savedPushId
    pushSubscriptionId.value = savedPushId || null
    notificationPermission.value = getBrowserNotificationPermission()
  }

  async function refreshUnreadCounts(options = {}) {
    const { force = false } = options
    if (!force && lastUnreadCountsRefreshAt.value > 0
      && (Date.now() - lastUnreadCountsRefreshAt.value) < UNREAD_COUNTS_FRESHNESS_MS) {
      return unreadCounts.value
    }

    if (unreadCountsRefreshPromise) {
      return unreadCountsRefreshPromise
    }

    unreadCountsRefreshPromise = api.get('/unread-counts')
      .then(({ data }) => {
        const counts = {}
        for (const item of data) {
          counts[item.channel_id] = item.count
        }
        useChannelsStore().setUnreadCounts(counts)
        lastUnreadCountsRefreshAt.value = Date.now()
        return unreadCounts.value
      })
      .catch((error) => {
        console.error('Failed to load unread counts:', error)
        return unreadCounts.value
      })
      .finally(() => {
        unreadCountsRefreshPromise = null
      })

    return unreadCountsRefreshPromise
  }

  async function refreshNotifications() {
    try {
      const { data } = await api.get('/notifications', { params: { $limit: 50 } })
      const items = asList(data)
      notifications.value = items
      unreadCount.value = Number.isInteger(data?.unread_total)
        ? data.unread_total
        : items.filter((notification) => !notification.is_read).length
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  async function markRead(id) {
    try {
      await api.patch(`/notifications/${id}`, { is_read: true })
      const notification = notifications.value.find((entry) => entry.id === id)
      if (notification && !notification.is_read) {
        notification.is_read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  async function markAllRead() {
    try {
      await api.patch('/notifications', { is_read: true }, { params: { is_read: false } })
      for (const notification of notifications.value) {
        notification.is_read = true
      }
      unreadCount.value = 0
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }

  async function markMatchingNotificationsRead(matchKey, params, matcher) {
    if (!matchKey || pendingAutoReadKeys.has(matchKey)) return 0

    pendingAutoReadKeys.add(matchKey)
    try {
      const { data } = await api.patch('/notifications', { is_read: true }, {
        params: {
          is_read: false,
          ...params
        }
      })

      let localUpdated = 0
      for (const notification of notifications.value) {
        if (notification.is_read || !matcher(notification)) continue
        notification.is_read = true
        localUpdated++
      }

      const updated = Number(data?.updated)
      const decrementBy = Number.isInteger(updated) ? updated : localUpdated
      unreadCount.value = Math.max(0, unreadCount.value - decrementBy)
      return decrementBy
    } catch (error) {
      console.error('Failed to auto-mark notifications as read:', error)
      throw error
    } finally {
      pendingAutoReadKeys.delete(matchKey)
    }
  }

  function markMessageNotificationsRead(messageId) {
    if (!messageId) return Promise.resolve(0)
    return markMessageNotificationsReadBatch([messageId])
  }

  async function markMessageNotificationsReadBatch(messageIds = []) {
    const uniqueMessageIds = [...new Set((messageIds || []).filter((messageId) => (
      typeof messageId === 'string' && messageId.trim()
    )))]
    const nextMessageIds = uniqueMessageIds.filter((messageId) => !pendingAutoReadMessageIds.has(messageId))
    if (nextMessageIds.length === 0) return 0

    for (const messageId of nextMessageIds) {
      pendingAutoReadMessageIds.add(messageId)
    }

    try {
      const { data } = await api.patch('/notifications', { is_read: true }, {
        params: {
          is_read: false,
          message_ids: nextMessageIds
        }
      })

      const messageIdSet = new Set(nextMessageIds)
      let localUpdated = 0
      for (const notification of notifications.value) {
        if (notification.is_read || !messageIdSet.has(notification.message_id)) continue
        notification.is_read = true
        localUpdated++
      }

      const updated = Number(data?.updated)
      const decrementBy = Number.isInteger(updated) ? updated : localUpdated
      unreadCount.value = Math.max(0, unreadCount.value - decrementBy)
      return decrementBy
    } catch (error) {
      console.error('Failed to auto-mark notifications as read:', error)
      throw error
    } finally {
      for (const messageId of nextMessageIds) {
        pendingAutoReadMessageIds.delete(messageId)
      }
    }
  }

  function markMeetingInviteRead(meetingId) {
    if (!meetingId) return Promise.resolve(0)
    return markMatchingNotificationsRead(
      `meeting:${meetingId}`,
      { meeting_id: meetingId, type: 'meeting_invite' },
      (notification) => notification.type === 'meeting_invite' && notification.meeting_id === meetingId
    )
  }

  async function updatePreference(pref) {
    const channelsStore = useChannelsStore()
    if (!channelsStore.myMembership) return
    try {
      await api.patch(`/channel-members/${channelsStore.myMembership.id}`, { notifications: pref })
      channelsStore.myMembership = { ...channelsStore.myMembership, notifications: pref }
    } catch (error) {
      console.error('Failed to update notification preference:', error)
      throw error
    }
  }

  async function enableBrowserPush() {
    notificationPermission.value = getBrowserNotificationPermission()
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error(t('ui.stores.web_push_is_not_supported_by_this_browser'))
    }

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      throw new Error(t('ui.stores.vite_vapid_public_key_is_not_configured'))
    }

    if (Notification.permission === 'denied') {
      notificationPermission.value = Notification.permission
      throw new Error(t('ui.stores.notifications_are_blocked_please_allow_them_in_browser'))
    }

    if (Notification.permission !== 'granted') {
      window.$message?.info(t('ui.stores.please_confirm_browser_permission_in_the_address_bar'), { duration: 8000 })

      const permission = await Promise.race([
        Notification.requestPermission(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PERMISSION_TIMEOUT')), 20000))
      ])

      notificationPermission.value = permission
      if (permission !== 'granted') {
        throw new Error(t('ui.stores.notification_permission_denied'))
      }
    }

    const registration = await waitForAppServiceWorkerReady()
    if (!registration) {
      throw new Error(t('ui.stores.push_service_unavailable_check_internet_connection_and_browser'))
    }

    const existingSub = await registration.pushManager.getSubscription()
    if (existingSub) {
      await existingSub.unsubscribe()
    }

    const isBrave = navigator.brave && (await navigator.brave.isBrave())
    let subscription
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })
    } catch (pushError) {
      console.error('[Push] subscribe failed:', pushError)
      if (isBrave) throw new Error('BRAVE_SETUP')
      throw new Error(t('ui.stores.push_service_unavailable_check_internet_connection_and_browser'))
    }

    const sub = subscription.toJSON()
    const { data } = await api.post('/push-subscriptions', {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth
    })

    pushEnabled.value = true
    pushSubscriptionId.value = data.id
    notificationPermission.value = getBrowserNotificationPermission()
    localStorage.setItem('pushSubscriptionId', data.id)
  }

  async function disableBrowserPush() {
    const id = pushSubscriptionId.value || localStorage.getItem('pushSubscriptionId')
    if (id) {
      try {
        await api.delete(`/push-subscriptions/${id}`)
      } catch {
        // ignore
      }
    }

    if ('serviceWorker' in navigator) {
      const registration = await waitForAppServiceWorkerReady()
      if (registration) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) await subscription.unsubscribe()
      }
    }

    pushEnabled.value = false
    pushSubscriptionId.value = null
    notificationPermission.value = getBrowserNotificationPermission()
    localStorage.removeItem('pushSubscriptionId')
  }

  async function enableDesktopNotifications() {
    const permission = isDesktopWorkspaceWindow()
      ? await requestDesktopWorkspaceNotificationPermission()
      : await requestDesktopNotificationPermission()
    notificationPermission.value = permission
    if (permission !== 'granted') {
      pushEnabled.value = false
      await persistDesktopNotificationPreferences({
        enabled: false,
        permission
      })
      throw new Error(t('ui.stores.notification_permission_denied'))
    }

    pushEnabled.value = true
    pushSubscriptionId.value = null
    await persistDesktopNotificationPreferences({
      enabled: true,
      permission
    })
  }

  async function disableDesktopNotifications() {
    pushEnabled.value = false
    pushSubscriptionId.value = null
    await persistDesktopNotificationPreferences({
      enabled: false,
      permission: notificationPermission.value
    })
  }

  async function enableNotifications() {
    if (usesDesktopNotificationRuntime.value) {
      await enableDesktopNotifications()
      return
    }

    await enableBrowserPush()
  }

  async function disableNotifications() {
    if (usesDesktopNotificationRuntime.value) {
      await disableDesktopNotifications()
      return
    }

    await disableBrowserPush()
  }

  async function enablePush() {
    await enableNotifications()
  }

  async function disablePush() {
    await disableNotifications()
  }

  function ingestIncomingNotification(notification) {
    if (!notification?.id) return
    if (notifications.value.find((entry) => entry.id === notification.id)) return

    notifications.value.unshift(notification)
    unreadCount.value++
  }

  return {
    unreadCounts,
    notifications,
    unreadCount,
    pushEnabled,
    pushSubscriptionId,
    notificationPermission,
    canToggleNotifications,
    notificationDeliveryState,
    showPanel,
    reset,
    syncNotificationState,
    refreshUnreadCounts,
    refreshNotifications,
    markRead,
    markAllRead,
    markMessageNotificationsRead,
    markMessageNotificationsReadBatch,
    markMeetingInviteRead,
    updatePreference,
    enableNotifications,
    disableNotifications,
    enablePush,
    disablePush,
    ingestIncomingNotification
  }
})
