import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '../../src/stores/notifications.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const pwaMock = vi.hoisted(() => ({
  waitForAppServiceWorkerReady: vi.fn()
}))

const runtimeState = vi.hoisted(() => ({
  desktop: false,
  workspaceDesktop: false
}))

const activeDesktopProfileState = vi.hoisted(() => ({
  value: null
}))

const getDesktopNotificationPermissionMock = vi.hoisted(() => vi.fn())
const requestDesktopNotificationPermissionMock = vi.hoisted(() => vi.fn())
const updateDesktopProfileNotificationPreferencesMock = vi.hoisted(() => vi.fn(async () => {}))
const getDesktopWorkspaceNotificationStateMock = vi.hoisted(() => vi.fn(() => ({
  enabled: true,
  permission: 'default'
})))
const requestDesktopWorkspaceNotificationPermissionMock = vi.hoisted(() => vi.fn())
const syncDesktopWorkspaceNotificationPreferencesMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getCurrentUser: vi.fn(() => null)
}))

vi.mock('../../src/lib/pwa.js', () => pwaMock)

vi.mock('../../src/lib/desktop-workspace-bridge.js', () => ({
  getDesktopWorkspaceNotificationState: getDesktopWorkspaceNotificationStateMock,
  requestDesktopWorkspaceNotificationPermission: requestDesktopWorkspaceNotificationPermissionMock,
  syncDesktopWorkspaceNotificationPreferences: syncDesktopWorkspaceNotificationPreferencesMock
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopRuntime: () => runtimeState.desktop,
  isAnyDesktopRuntime: () => runtimeState.desktop || runtimeState.workspaceDesktop,
  isDesktopWorkspaceWindow: () => runtimeState.workspaceDesktop
}))

vi.mock('../../src/lib/desktop-notification-plugin.js', () => ({
  getDesktopNotificationPermission: getDesktopNotificationPermissionMock,
  requestDesktopNotificationPermission: requestDesktopNotificationPermissionMock
}))

vi.mock('../../src/lib/desktop-runtime.js', () => ({
  getActiveDesktopProfile: () => activeDesktopProfileState.value,
  updateDesktopProfileNotificationPreferences: updateDesktopProfileNotificationPreferencesMock
}))

const channelsStoreMock = vi.hoisted(() => ({
  unreadCounts: {},
  myMembership: null,
  setUnreadCounts(counts) {
    this.unreadCounts = counts
  }
}))

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
  pwaMock.waitForAppServiceWorkerReady.mockReset()
  getDesktopNotificationPermissionMock.mockReset()
  requestDesktopNotificationPermissionMock.mockReset()
  updateDesktopProfileNotificationPreferencesMock.mockReset()
  updateDesktopProfileNotificationPreferencesMock.mockResolvedValue(undefined)
  getDesktopWorkspaceNotificationStateMock.mockReset()
  getDesktopWorkspaceNotificationStateMock.mockReturnValue({
    enabled: true,
    permission: 'default'
  })
  requestDesktopWorkspaceNotificationPermissionMock.mockReset()
  syncDesktopWorkspaceNotificationPreferencesMock.mockReset()
}

describe('notifications store', () => {
  beforeEach(() => {
    resetApiMock()
    runtimeState.desktop = false
    runtimeState.workspaceDesktop = false
    activeDesktopProfileState.value = null
    channelsStoreMock.unreadCounts = {}
    channelsStoreMock.myMembership = null
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('maps sparse unread-count rows by channel id and leaves missing channels implicit zero', async () => {
    const store = useNotificationsStore()
    channelsStoreMock.unreadCounts = {
      'channel-legacy': 8
    }
    apiMock.get.mockResolvedValue({
      data: [
        { channel_id: 'channel-1', count: 3 }
      ]
    })

    await store.refreshUnreadCounts()

    expect(apiMock.get).toHaveBeenCalledWith('/unread-counts')
    expect(channelsStoreMock.unreadCounts).toEqual({
      'channel-1': 3
    })
    expect(channelsStoreMock.unreadCounts['channel-2']).toBeUndefined()
  })

  it('reuses unread counts within the freshness window unless the refresh is forced', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-06-23T10:00:00.000Z'))
      const store = useNotificationsStore()
      apiMock.get.mockResolvedValue({
        data: [
          { channel_id: 'channel-1', count: 2 }
        ]
      })

      await store.refreshUnreadCounts()

      vi.setSystemTime(new Date('2026-06-23T10:00:20.000Z'))
      await store.refreshUnreadCounts()
      await store.refreshUnreadCounts({ force: true })

      expect(apiMock.get).toHaveBeenCalledTimes(2)
      expect(apiMock.get).toHaveBeenNthCalledWith(1, '/unread-counts')
      expect(apiMock.get).toHaveBeenNthCalledWith(2, '/unread-counts')
    } finally {
      vi.useRealTimers()
    }
  })

  it('marks one notification as read and decrements unread count once', async () => {
    const store = useNotificationsStore()
    apiMock.patch.mockResolvedValue({ data: {} })
    store.notifications = [
      { id: 'notification-1', is_read: false },
      { id: 'notification-2', is_read: true }
    ]
    store.unreadCount = 1

    await store.markRead('notification-1')
    await store.markRead('notification-2')

    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/notifications/notification-1', { is_read: true })
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/notifications/notification-2', { is_read: true })
    expect(store.notifications[0].is_read).toBe(true)
    expect(store.unreadCount).toBe(0)
  })

  it('uses server unread_total when refreshing notifications', async () => {
    const store = useNotificationsStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          { id: 'notification-1', is_read: true },
          { id: 'notification-2', is_read: false }
        ],
        unread_total: 6
      }
    })

    await store.refreshNotifications()

    expect(store.notifications).toHaveLength(2)
    expect(store.unreadCount).toBe(6)
  })

  it('auto-marks message notifications read once and decrements by backend updated count', async () => {
    const store = useNotificationsStore()
    store.notifications = [
      { id: 'notification-1', message_id: 'message-1', is_read: false },
      { id: 'notification-2', message_id: 'message-1', is_read: false },
      { id: 'notification-3', message_id: 'message-2', is_read: false }
    ]
    store.unreadCount = 5
    let resolvePatch
    apiMock.patch.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePatch = resolve
    }))

    const firstRequest = store.markMessageNotificationsRead('message-1')
    const secondRequest = store.markMessageNotificationsRead('message-1')

    expect(apiMock.patch).toHaveBeenCalledTimes(1)
    expect(apiMock.patch).toHaveBeenCalledWith('/notifications', { is_read: true }, {
      params: {
        is_read: false,
        message_ids: ['message-1']
      }
    })

    resolvePatch({ data: { updated: 3 } })
    await Promise.all([firstRequest, secondRequest])

    expect(store.notifications[0].is_read).toBe(true)
    expect(store.notifications[1].is_read).toBe(true)
    expect(store.notifications[2].is_read).toBe(false)
    expect(store.unreadCount).toBe(2)
  })

  it('batches visible message notification reads into one request and updates local unread state', async () => {
    const store = useNotificationsStore()
    store.notifications = [
      { id: 'notification-1', message_id: 'message-1', is_read: false },
      { id: 'notification-2', message_id: 'message-2', is_read: false },
      { id: 'notification-3', message_id: 'message-3', is_read: false }
    ]
    store.unreadCount = 4
    apiMock.patch.mockResolvedValueOnce({ data: { updated: 2 } })

    const updated = await store.markMessageNotificationsReadBatch(['message-1', 'message-2', 'message-2'])

    expect(updated).toBe(2)
    expect(apiMock.patch).toHaveBeenCalledWith('/notifications', { is_read: true }, {
      params: {
        is_read: false,
        message_ids: ['message-1', 'message-2']
      }
    })
    expect(store.notifications[0].is_read).toBe(true)
    expect(store.notifications[1].is_read).toBe(true)
    expect(store.notifications[2].is_read).toBe(false)
    expect(store.unreadCount).toBe(2)
  })

  it('skips message ids that are already in a pending batch request', async () => {
    const store = useNotificationsStore()
    let resolvePatch
    apiMock.patch.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePatch = resolve
    }))
    apiMock.patch.mockResolvedValueOnce({ data: { updated: 1 } })

    const firstRequest = store.markMessageNotificationsReadBatch(['message-1', 'message-2'])
    const secondRequest = store.markMessageNotificationsReadBatch(['message-2', 'message-3'])

    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/notifications', { is_read: true }, {
      params: {
        is_read: false,
        message_ids: ['message-1', 'message-2']
      }
    })
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/notifications', { is_read: true }, {
      params: {
        is_read: false,
        message_ids: ['message-3']
      }
    })

    resolvePatch({ data: { updated: 2 } })
    await Promise.all([firstRequest, secondRequest])
  })

  it('auto-marks meeting invite notifications read once and only for matching meeting', async () => {
    const store = useNotificationsStore()
    store.notifications = [
      { id: 'notification-1', type: 'meeting_invite', meeting_id: 'meeting-1', is_read: false },
      { id: 'notification-2', type: 'meeting_invite', meeting_id: 'meeting-2', is_read: false },
      { id: 'notification-3', type: 'mention', meeting_id: 'meeting-1', is_read: false }
    ]
    store.unreadCount = 3
    apiMock.patch.mockResolvedValueOnce({ data: { updated: 1 } })

    await store.markMeetingInviteRead('meeting-1')

    expect(apiMock.patch).toHaveBeenCalledWith('/notifications', { is_read: true }, {
      params: {
        is_read: false,
        meeting_id: 'meeting-1',
        type: 'meeting_invite'
      }
    })
    expect(store.notifications[0].is_read).toBe(true)
    expect(store.notifications[1].is_read).toBe(false)
    expect(store.notifications[2].is_read).toBe(false)
    expect(store.unreadCount).toBe(2)
  })

  it('syncs browser notification state from local storage and permission', async () => {
    const store = useNotificationsStore()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'push-1'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    })
    vi.stubGlobal('Notification', {
      permission: 'granted'
    })

    await store.syncNotificationState()

    expect(store.pushEnabled).toBe(true)
    expect(store.pushSubscriptionId).toBe('push-1')
    expect(store.notificationPermission).toBe('granted')
    expect(store.notificationDeliveryState).toEqual({
      runtime: 'browser',
      enabled: true,
      permission: 'granted',
      pushSubscriptionId: 'push-1'
    })
  })

  it('reuses the shared service worker registration when enabling browser notifications', async () => {
    const store = useNotificationsStore()
    const existingSubscription = {
      unsubscribe: vi.fn().mockResolvedValue(undefined)
    }
    const nextSubscription = {
      toJSON: () => ({
        endpoint: 'https://example.com/sub',
        keys: {
          p256dh: 'p256dh',
          auth: 'auth'
        }
      })
    }
    const registration = {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existingSubscription),
        subscribe: vi.fn().mockResolvedValue(nextSubscription)
      }
    }

    pwaMock.waitForAppServiceWorkerReady.mockResolvedValue(registration)
    apiMock.post.mockResolvedValue({ data: { id: 'push-1' } })
    vi.stubGlobal('navigator', {
      serviceWorker: {},
      brave: null
    })
    globalThis.window.PushManager = class PushManager {}
    globalThis.window.atob = globalThis.atob
    globalThis.window.$message = { info: vi.fn() }
    vi.stubGlobal('Notification', {
      permission: 'granted'
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    })
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl6lL0x2M1Yw7R8C9D0EfGhIjKlMnOpQrStUvWxYz1234567890-_')

    await store.enableNotifications()

    expect(pwaMock.waitForAppServiceWorkerReady).toHaveBeenCalledTimes(1)
    expect(registration.pushManager.getSubscription).toHaveBeenCalledTimes(1)
    expect(existingSubscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(apiMock.post).toHaveBeenCalledWith('/push-subscriptions', {
      endpoint: 'https://example.com/sub',
      p256dh: 'p256dh',
      auth: 'auth'
    })
    expect(store.pushEnabled).toBe(true)
    expect(store.pushSubscriptionId).toBe('push-1')
  })

  it('syncs desktop notification state from the active profile and plugin permission', async () => {
    runtimeState.desktop = true
    activeDesktopProfileState.value = {
      id: 'profile-1',
      notificationPreferences: {
        enabled: false,
        permission: 'default'
      }
    }
    getDesktopNotificationPermissionMock.mockResolvedValue('granted')

    const store = useNotificationsStore()
    await store.syncNotificationState()

    expect(store.pushEnabled).toBe(false)
    expect(store.pushSubscriptionId).toBe(null)
    expect(store.notificationPermission).toBe('granted')
    expect(updateDesktopProfileNotificationPreferencesMock).toHaveBeenCalledWith('profile-1', {
      permission: 'granted'
    })
    expect(store.notificationDeliveryState).toEqual({
      runtime: 'desktop',
      enabled: false,
      permission: 'granted',
      pushSubscriptionId: null
    })
  })

  it('enables desktop notifications per active profile after requesting permission', async () => {
    runtimeState.desktop = true
    activeDesktopProfileState.value = {
      id: 'profile-1',
      notificationPreferences: {
        enabled: false,
        permission: 'default'
      }
    }
    requestDesktopNotificationPermissionMock.mockResolvedValue('granted')

    const store = useNotificationsStore()
    await store.enableNotifications()

    expect(requestDesktopNotificationPermissionMock).toHaveBeenCalledTimes(1)
    expect(updateDesktopProfileNotificationPreferencesMock).toHaveBeenCalledWith('profile-1', {
      enabled: true,
      permission: 'granted'
    })
    expect(store.pushEnabled).toBe(true)
    expect(store.notificationPermission).toBe('granted')
  })

  it('keeps desktop notifications disabled when permission is denied', async () => {
    runtimeState.desktop = true
    activeDesktopProfileState.value = {
      id: 'profile-1',
      notificationPreferences: {
        enabled: false,
        permission: 'default'
      }
    }
    requestDesktopNotificationPermissionMock.mockResolvedValue('denied')

    const store = useNotificationsStore()

    await expect(store.enableNotifications()).rejects.toThrow('Notification permission denied')

    expect(updateDesktopProfileNotificationPreferencesMock).toHaveBeenCalledWith('profile-1', {
      enabled: false,
      permission: 'denied'
    })
    expect(store.pushEnabled).toBe(false)
    expect(store.notificationPermission).toBe('denied')
  })

  it('disables desktop notifications for only the active profile', async () => {
    runtimeState.desktop = true
    activeDesktopProfileState.value = {
      id: 'profile-1',
      notificationPreferences: {
        enabled: true,
        permission: 'granted'
      }
    }

    const store = useNotificationsStore()
    store.pushEnabled = true
    store.notificationPermission = 'granted'

    await store.disableNotifications()

    expect(updateDesktopProfileNotificationPreferencesMock).toHaveBeenCalledWith('profile-1', {
      enabled: false,
      permission: 'granted'
    })
    expect(store.pushEnabled).toBe(false)
  })

  it('syncs desktop workspace notification state from the desktop bridge', async () => {
    runtimeState.workspaceDesktop = true
    getDesktopWorkspaceNotificationStateMock.mockReturnValue({
      enabled: false,
      permission: 'granted'
    })

    const store = useNotificationsStore()
    await store.syncNotificationState()

    expect(store.pushEnabled).toBe(false)
    expect(store.notificationPermission).toBe('granted')
    expect(store.notificationDeliveryState).toEqual({
      runtime: 'desktop',
      enabled: false,
      permission: 'granted',
      pushSubscriptionId: null
    })
  })

  it('requests desktop workspace notification permission through the desktop bridge', async () => {
    runtimeState.workspaceDesktop = true
    requestDesktopWorkspaceNotificationPermissionMock.mockResolvedValue('granted')

    const store = useNotificationsStore()
    await store.enableNotifications()

    expect(requestDesktopWorkspaceNotificationPermissionMock).toHaveBeenCalledTimes(1)
    expect(syncDesktopWorkspaceNotificationPreferencesMock).toHaveBeenCalledWith({
      enabled: true,
      permission: 'granted'
    })
    expect(store.pushEnabled).toBe(true)
  })
})
