import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api, {
  beginPasskeyAuthentication as beginPasskeyAuthenticationRequest,
  beginPasskeyRegistration as beginPasskeyRegistrationRequest,
  beginTwoFactorSetup as beginTwoFactorSetupRequest,
  changePassword as changePasswordRequest,
  clearStoredAuth,
  completeBrowserAuthentication,
  confirmTwoFactorSetup as confirmTwoFactorSetupRequest,
  deletePasskey as deletePasskeyRequest,
  disableTwoFactor as disableTwoFactorRequest,
  getPasskeys as getPasskeysRequest,
  getCurrentUser,
  getTwoFactorStatus as getTwoFactorStatusRequest,
  login as loginRequest,
  logout as logoutRequest,
  regenerateTwoFactorRecoveryCodes as regenerateTwoFactorRecoveryCodesRequest,
  restoreBrowserSession,
  setupPlatform as setupPlatformRequest,
  verifyPasskeyAuthentication as verifyPasskeyAuthenticationRequest,
  verifyPasskeyRegistration as verifyPasskeyRegistrationRequest,
  verifyTwoFactorLogin as verifyTwoFactorLoginRequest
} from '../lib/api.js'
import router from '../router/index.js'
import { connectSocket, disconnectSocket, subscribeToSocketAuthenticated } from '../lib/socket.js'
import { startForegroundResumeSync } from '../lib/foreground-resume-sync.js'
import { applyLocaleForUser } from '../lib/i18n.js'
import { startForegroundChannelTracking } from '../lib/foreground-channel.js'
import { mergeMeetingVideoPreferences, normalizeMeetingVideoPreferences } from '../lib/meeting-video-preferences.js'
import { resolveUserPresenceState } from '../lib/user-presence.js'
import {
  signalDesktopWorkspaceLogout,
  syncDesktopWorkspaceSession
} from '../lib/desktop-workspace-bridge.js'
import { clearDesktopProfileSession, getActiveDesktopProfile, updateDesktopProfileSession } from '../lib/desktop-runtime.js'
import { isDesktopWorkspaceWindow } from '../lib/runtime.js'
import { useChannelsStore } from './channels.js'
import { useDmsStore } from './dms.js'
import { useMessagesStore } from './messages.js'
import { useNotificationsStore } from './notifications.js'
import { useVoiceStore } from './voice.js'
import { useUiStore } from './ui.js'
import { useMeetingsStore } from './meetings.js'
import { useVoiceMessageArtifactsStore } from './voice-message-artifacts.js'
import { useMessageSummariesStore } from './message-summaries.js'
import { usePlatformUpdatesStore } from './platform-updates.js'
import { setupRealtimeListeners } from './realtime.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function uniqueUserIds(userIds = []) {
  return [...new Set((userIds || []).filter(Boolean))]
}

let initialized = false
let stopForegroundChannelTracking = null
let stopForegroundResumeSync = null
let stopSocketAuthenticatedSync = null

function getActiveDesktopSessionTransport() {
  return getActiveDesktopProfile() || isDesktopWorkspaceWindow() ? 'body' : undefined
}

async function syncActiveDesktopSession(snapshot = {}) {
  if (isDesktopWorkspaceWindow()) {
    await syncDesktopWorkspaceSession(snapshot)
    return
  }

  const profile = getActiveDesktopProfile()
  if (!profile) return

  await updateDesktopProfileSession(profile.id, {
    accessToken: snapshot.accessToken !== undefined
      ? snapshot.accessToken
      : profile.authState?.accessToken || null,
    csrfToken: snapshot.csrfToken !== undefined
      ? snapshot.csrfToken
      : profile.authState?.csrfToken || null,
    refreshToken: snapshot.refreshToken !== undefined
      ? snapshot.refreshToken
      : profile.authState?.refreshToken || null,
    sessionTransport: snapshot.sessionTransport !== undefined
      ? snapshot.sessionTransport
      : profile.authState?.sessionTransport || 'body',
    user: snapshot.user !== undefined
      ? snapshot.user
      : profile.authState?.user || null
  })
}

async function clearActiveDesktopSession() {
  if (isDesktopWorkspaceWindow()) {
    await signalDesktopWorkspaceLogout()
    return
  }

  const profile = getActiveDesktopProfile()
  if (!profile) return
  await clearDesktopProfileSession(profile.id)
}

export const useSessionStore = defineStore('session', () => {
  const user = ref(null)
  const allUsers = ref([])
  const userMap = ref({})
  const recentUserIds = ref([])
  const defaultDirectoryUserIds = ref([])
  const defaultDirectoryLoaded = ref(false)
  const defaultDirectoryLoadedLimit = ref(0)
  const onlineUserIds = ref([])
  const presenceLoaded = ref(false)
  const presenceSyncPending = ref(false)
  const lastPresenceRefreshAt = ref(null)
  const permissions = ref([])
  const platformRoles = ref([])
  const invites = ref([])
  const isLoggedIn = computed(() => !!user.value)

  function normalizeUserPayload(entry) {
    if (!entry || typeof entry !== 'object') return entry
    return {
      ...entry,
      meeting_video_preferences: normalizeMeetingVideoPreferences(entry.meeting_video_preferences)
    }
  }

  function reset() {
    user.value = null
    allUsers.value = []
    userMap.value = {}
    recentUserIds.value = []
    defaultDirectoryUserIds.value = []
    defaultDirectoryLoaded.value = false
    defaultDirectoryLoadedLimit.value = 0
    onlineUserIds.value = []
    presenceLoaded.value = false
    presenceSyncPending.value = false
    lastPresenceRefreshAt.value = null
    permissions.value = []
    platformRoles.value = []
    invites.value = []
  }

  function rebuildAllUsers() {
    allUsers.value = recentUserIds.value
      .map((id) => userMap.value[id])
      .filter(Boolean)
  }

  function setDefaultDirectoryUsers(users = [], limit = 0) {
    const memberIds = [...new Set(
      (Array.isArray(users) ? users : [])
        .filter((entry) => entry?.id && entry.account_type === 'member')
        .map((entry) => entry.id)
    )]

    defaultDirectoryUserIds.value = memberIds
    defaultDirectoryLoaded.value = true
    defaultDirectoryLoadedLimit.value = limit
  }

  function primeUsers(users = []) {
    if (!Array.isArray(users) || users.length === 0) return []

    const nextMap = { ...userMap.value }
    const nextRecentIds = [...recentUserIds.value]

    for (const entry of users) {
      if (!entry?.id) continue
      const normalizedEntry = normalizeUserPayload(entry)
      const existing = nextMap[entry.id] || {}
      const normalizedDefinedEntry = Object.fromEntries(
        Object.entries(normalizedEntry).filter(([, value]) => value !== undefined)
      )
      nextMap[entry.id] = { ...existing, ...normalizedDefinedEntry }
      const existingIndex = nextRecentIds.indexOf(entry.id)
      if (existingIndex !== -1) {
        nextRecentIds.splice(existingIndex, 1)
      }
      nextRecentIds.unshift(entry.id)
    }

    userMap.value = nextMap
    recentUserIds.value = nextRecentIds
    rebuildAllUsers()
    return users
  }

  function getUserById(userId) {
    if (!userId) return null
    return userMap.value[userId] || null
  }

  function getUsersByIds(userIds = []) {
    return [...new Set((userIds || []).filter(Boolean))]
      .map((userId) => getUserById(userId))
      .filter(Boolean)
  }

  function getDirectoryUsersByIds(userIds = []) {
    return getUsersByIds(userIds)
      .filter((entry) => entry?.account_type === 'member')
  }

  function getDefaultDirectoryUsers(limit = null) {
    const users = getDirectoryUsersByIds(defaultDirectoryUserIds.value)
    if (typeof limit === 'number' && limit >= 0) {
      return users.slice(0, limit)
    }
    return users
  }

  async function ensureDirectoryUsersLoaded(options = {}) {
    const limit = Math.min(options.limit || 30, 200)
    if (!options.force && defaultDirectoryLoaded.value && defaultDirectoryLoadedLimit.value >= limit) {
      return getDefaultDirectoryUsers(limit)
    }

    try {
      const { data } = await api.get('/users', {
        params: {
          $limit: limit
        }
      })
      const users = asList(data)
      primeUsers(users)
      setDefaultDirectoryUsers(users, limit)
      return getDefaultDirectoryUsers(limit)
    } catch (error) {
      console.error('Failed to load users directory:', error)
      return getDefaultDirectoryUsers(limit)
    }
  }

  async function ensureUsersByIds(userIds = [], options = {}) {
    const requestedIds = uniqueUserIds(userIds)
    const userIdsToFetch = options.force
      ? requestedIds
      : requestedIds.filter((userId) => !userMap.value[userId])
    if (userIdsToFetch.length === 0) {
      return getUsersByIds(requestedIds)
    }

    try {
      const params = {
        ids: userIdsToFetch,
        $limit: userIdsToFetch.length
      }
      if (typeof options.channelId === 'string' && options.channelId.trim()) {
        params.channel_id = options.channelId.trim()
      }

      const { data } = await api.get('/users', {
        params
      })
      const users = asList(data)
      primeUsers(users)
    } catch (error) {
      console.error('Failed to hydrate users by id:', error)
    }

    return getUsersByIds(requestedIds)
  }

  function getPresenceTrackedUserIds(userIds = [], options = {}) {
    const explicitIds = uniqueUserIds(userIds)
    const recentIdSet = new Set(recentUserIds.value)
    const trackedIds = []

    if (user.value?.id) {
      trackedIds.push(user.value.id)
    }

    for (const userId of explicitIds) {
      if (options.includeUnknown === true || userMap.value[userId] || recentIdSet.has(userId)) {
        trackedIds.push(userId)
      }
    }

    return uniqueUserIds(trackedIds)
  }

  async function reconcilePresenceUsers(userIds = [], options = {}) {
    const trackedUserIds = getPresenceTrackedUserIds(userIds, options)
    if (trackedUserIds.length === 0) {
      return []
    }

    return ensureUsersByIds(trackedUserIds, {
      ...options,
      force: true
    })
  }

  function resolveUserPresence(userOrId) {
    const targetUser = typeof userOrId === 'string'
      ? getUserById(userOrId) || { id: userOrId }
      : userOrId

    return resolveUserPresenceState({
      user: targetUser,
      currentUserId: user.value?.id || null,
      onlineUserIds: onlineUserIds.value,
      presenceSyncPending: presenceSyncPending.value
    })
  }

  function persistCurrentUserSnapshot() {
    return syncActiveDesktopSession({
      user: user.value
    }).catch(() => {})
  }

  async function syncForegroundResumeState({ includeVisibleChat = false, reason = 'manual' } = {}) {
    const channelsStore = useChannelsStore()
    const dmsStore = useDmsStore()
    const messagesStore = useMessagesStore()
    const notificationsStore = useNotificationsStore()

    const activeChannelId = channelsStore.activeChannelId
    const forceUnreadCountsRefresh = reason === 'socket-authenticated'
    const forceDmRefresh = reason === 'socket-authenticated'
    const safeTask = (task) => Promise.resolve()
      .then(task)
      .catch(() => {})

    await Promise.all([
      safeTask(() => channelsStore.refresh()),
      forceDmRefresh
        ? safeTask(() => dmsStore.refresh({ force: true }))
        : safeTask(() => dmsStore.refresh()),
      forceUnreadCountsRefresh
        ? safeTask(() => notificationsStore.refreshUnreadCounts({ force: true }))
        : safeTask(() => notificationsStore.refreshUnreadCounts()),
      safeTask(() => notificationsStore.refreshNotifications()),
      activeChannelId
        ? dmsStore.hasDmChannel?.(activeChannelId)
          ? safeTask(() => dmsStore.refreshChannel(activeChannelId))
          : channelsStore.hasChannel?.(activeChannelId)
            ? safeTask(() => channelsStore.refreshChannel(activeChannelId))
            : Promise.resolve()
        : Promise.resolve()
    ])

    if (includeVisibleChat) {
      await safeTask(() => messagesStore.syncActiveTimelineFromLatest())
    }
  }

  async function ensureUser(userId, options = {}) {
    if (!userId) return null
    if (userMap.value[userId]) return userMap.value[userId]
    const users = await ensureUsersByIds([userId], options)
    return users[0] || null
  }

  async function searchUsers(query, options = {}) {
    const searchTerm = typeof query === 'string' ? query.trim() : ''
    if (!searchTerm) return []

    const limit = Math.min(options.limit || 20, 50)

    try {
      const { data } = await api.get('/users', {
        params: {
          q: searchTerm,
          $limit: limit
        }
      })
      const users = asList(data)
      primeUsers(users)
      return users
    } catch (error) {
      console.error('Failed to search users:', error)
      return []
    }
  }

  async function login(email, password, options = {}) {
    const sessionTransport = getActiveDesktopSessionTransport()
    const data = await loginRequest(email, password, sessionTransport
      ? { ...options, sessionTransport }
      : options)
    if (data?.accessToken || data?.user) {
      user.value = normalizeUserPayload(data?.user || getCurrentUser())
      primeUsers(user.value ? [user.value] : [])
      applyLocaleForUser(user.value)
      presenceSyncPending.value = Boolean(user.value)
      await syncActiveDesktopSession({
        accessToken: data?.accessToken || null,
        refreshToken: data?.refreshToken,
        sessionTransport,
        user: user.value
      })
    }
    return data
  }

  async function verifyTwoFactorLogin(payload, options = {}) {
    const sessionTransport = getActiveDesktopSessionTransport()
    const requestPayload = sessionTransport
      ? { ...payload, sessionTransport }
      : payload
    const data = await verifyTwoFactorLoginRequest(requestPayload, options)
    user.value = normalizeUserPayload(data?.user || getCurrentUser())
    primeUsers(user.value ? [user.value] : [])
    applyLocaleForUser(user.value)
    presenceSyncPending.value = Boolean(user.value)
    await syncActiveDesktopSession({
      accessToken: data?.accessToken || null,
      refreshToken: data?.refreshToken,
      sessionTransport,
      user: user.value
    })
    return data
  }

  async function beginPasskeyAuthentication(payload) {
    return beginPasskeyAuthenticationRequest(payload)
  }

  async function verifyPasskeyAuthentication(payload, options = {}) {
    const sessionTransport = getActiveDesktopSessionTransport()
    const requestPayload = sessionTransport
      ? { ...payload, sessionTransport }
      : payload
    const data = await verifyPasskeyAuthenticationRequest(requestPayload, options)
    user.value = normalizeUserPayload(data?.user || getCurrentUser())
    primeUsers(user.value ? [user.value] : [])
    applyLocaleForUser(user.value)
    presenceSyncPending.value = Boolean(user.value)
    await syncActiveDesktopSession({
      accessToken: data?.accessToken || null,
      refreshToken: data?.refreshToken,
      sessionTransport,
      user: user.value
    })
    return data
  }

  async function setupPlatform(payload) {
    return setupPlatformRequest(payload)
  }

  async function init() {
    let currentUser = getCurrentUser()
    if (!currentUser) {
      try {
        await restoreBrowserSession()
        currentUser = getCurrentUser()
      } catch {
        currentUser = null
      }
    }

    user.value = normalizeUserPayload(currentUser)
    primeUsers(user.value ? [user.value] : [])
    applyLocaleForUser(user.value)
    if (user.value && !presenceLoaded.value) {
      presenceSyncPending.value = true
    }
    await syncActiveDesktopSession({
      user: user.value
    })
    if (!user.value) return

    const channelsStore = useChannelsStore()
    const dmsStore = useDmsStore()
    const messagesStore = useMessagesStore()
    const notificationsStore = useNotificationsStore()
    const voiceStore = useVoiceStore()
    const meetingsStore = useMeetingsStore()
    const voiceMessageArtifactsStore = useVoiceMessageArtifactsStore()
    const messageSummariesStore = useMessageSummariesStore()

    if (!initialized) {
      const socket = connectSocket()
      setupRealtimeListeners(socket, {
        sessionStore: useSessionStore(),
        channelsStore,
        dmsStore,
        messagesStore,
        notificationsStore,
        voiceStore,
        meetingsStore,
        voiceMessageArtifactsStore,
        messageSummariesStore
      })
      stopForegroundChannelTracking?.()
      stopForegroundChannelTracking = startForegroundChannelTracking({
        socket,
        router,
        subscribeToAuthenticated: subscribeToSocketAuthenticated
      })
      stopForegroundResumeSync?.()
      const foregroundResumeSync = startForegroundResumeSync({
        onSync: ({ includeVisibleChat, reason }) => syncForegroundResumeState({ includeVisibleChat, reason })
      })
      stopForegroundResumeSync = () => {
        foregroundResumeSync.stop()
      }
      stopSocketAuthenticatedSync?.()
      stopSocketAuthenticatedSync = subscribeToSocketAuthenticated(async (authenticatedSocket) => {
        if (authenticatedSocket !== socket) return
        presenceSyncPending.value = true
        await refreshPresence().catch(() => {})
        await Promise.resolve(voiceStore.reconnectIfNeeded()).catch(() => {})
        foregroundResumeSync.requestSync('socket-authenticated', {
          immediate: true,
          requireVisibleChat: true
        })
      })
      initialized = true
    }

    await notificationsStore.syncNotificationState()

    await Promise.all([
      channelsStore.refresh(),
      dmsStore.refresh({ force: true }),
      refreshPermissions(),
      refreshPresence(),
      notificationsStore.refreshUnreadCounts({ force: true }),
      notificationsStore.refreshNotifications(),
      voiceStore.refreshParticipants()
    ])

    // Keep meeting channels/topic metadata in store after channel refreshes.
    await meetingsStore.refresh(true)

    await voiceStore.reconnectIfNeeded()
  }

  async function refreshPermissions() {
    try {
      const { data } = await api.get('/my-permissions')
      permissions.value = data.permissions || []
      platformRoles.value = data.roles || []
    } catch (error) {
      console.error('Failed to load permissions:', error)
    }
  }

  function hasPermission(name) {
    if (user.value?.is_admin) return true
    return permissions.value.includes(name)
  }

  async function refreshPresence() {
    try {
      const { data } = await api.get('/presence')
      const nextOnlineUserIds = uniqueUserIds(data.online || [])
      onlineUserIds.value = nextOnlineUserIds
      presenceLoaded.value = true
      lastPresenceRefreshAt.value = new Date().toISOString()

      if (!user.value?.id || nextOnlineUserIds.includes(user.value.id)) {
        presenceSyncPending.value = false
      }

      await reconcilePresenceUsers(nextOnlineUserIds).catch(() => {})
    } catch (error) {
      console.error('Failed to load presence:', error)
    }
  }

  function isOnline(userId) {
    return onlineUserIds.value.includes(userId)
  }

  async function refreshAllUsers() {
    return allUsers.value
  }

  async function updateStatus(statusData) {
    if (!user.value?.id) return
    try {
      const { data } = await api.patch(`/users/${user.value.id}`, statusData)
      const normalizedData = normalizeUserPayload(data)
      primeUsers([normalizedData])
      user.value = { ...user.value, ...normalizedData }
      await persistCurrentUserSnapshot()
    } catch (error) {
      console.error('Failed to update status:', error)
      throw error
    }
  }

  async function updateProfile(profileData) {
    if (!user.value?.id) return
    try {
      const { data } = await api.patch(`/users/${user.value.id}`, profileData)
      const normalizedData = normalizeUserPayload(data)
      primeUsers([normalizedData])
      user.value = { ...user.value, ...normalizedData }
      await persistCurrentUserSnapshot()
      if (Object.prototype.hasOwnProperty.call(profileData, 'preferred_locale')) {
        applyLocaleForUser(user.value)
      }
    } catch (error) {
      console.error('Failed to update profile:', error)
      throw error
    }
  }

  async function uploadOwnAvatar(file) {
    if (!user.value?.id || !file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      const normalizedData = normalizeUserPayload(data)
      primeUsers([normalizedData])
      user.value = { ...user.value, ...normalizedData }
      await persistCurrentUserSnapshot()
      return data
    } catch (error) {
      console.error('Failed to upload avatar:', error)
      throw error
    }
  }

  async function removeOwnAvatar() {
    if (!user.value?.id) return

    try {
      const { data } = await api.delete('/users/me/avatar')
      const normalizedData = normalizeUserPayload(data)
      primeUsers([normalizedData])
      user.value = { ...user.value, ...normalizedData }
      await persistCurrentUserSnapshot()
      return data
    } catch (error) {
      console.error('Failed to remove avatar:', error)
      throw error
    }
  }

  function addOnlineUserId(userId) {
    if (!onlineUserIds.value.includes(userId)) {
      onlineUserIds.value.push(userId)
    }
  }

  function removeOnlineUserId(userId) {
    onlineUserIds.value = onlineUserIds.value.filter((id) => id !== userId)
  }

  function applyUserPatch(userPatch) {
    if (!userPatch?.id) return
    const normalizedPatch = normalizeUserPayload(userPatch)
    primeUsers([normalizedPatch])

    if (normalizedPatch.id === user.value?.id) {
      user.value = { ...user.value, ...normalizedPatch }
      persistCurrentUserSnapshot()
      if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'preferred_locale')) {
        applyLocaleForUser(user.value)
      }
    }
  }

  async function updateMeetingVideoPreferences(preferencesPatch) {
    const nextPreferences = mergeMeetingVideoPreferences(
      user.value?.meeting_video_preferences,
      preferencesPatch
    )
    return updateProfile({
      meeting_video_preferences: nextPreferences
    })
  }

  function clearStatusForUser(userId) {
    const target = getUserById(userId)
    if (target) {
      primeUsers([{
        ...target,
        custom_status: null,
        custom_status_emoji: null,
        status_expires_at: null
      }])
    }

    if (user.value?.id === userId) {
      user.value.custom_status = null
      user.value.custom_status_emoji = null
      user.value.status_expires_at = null
      persistCurrentUserSnapshot()
    }
  }

  async function changePassword(payload) {
    return changePasswordRequest(payload)
  }

  async function getTwoFactorStatus() {
    return getTwoFactorStatusRequest()
  }

  async function beginTwoFactorSetup() {
    return beginTwoFactorSetupRequest()
  }

  async function getPasskeys() {
    return getPasskeysRequest()
  }

  async function beginPasskeyRegistration(payload) {
    return beginPasskeyRegistrationRequest(payload)
  }

  async function verifyPasskeyRegistration(payload) {
    return verifyPasskeyRegistrationRequest(payload)
  }

  async function deletePasskey(passkeyId, payload) {
    return deletePasskeyRequest(passkeyId, payload)
  }

  async function confirmTwoFactorSetup(payload) {
    return confirmTwoFactorSetupRequest(payload)
  }

  async function regenerateTwoFactorRecoveryCodes(payload) {
    return regenerateTwoFactorRecoveryCodesRequest(payload)
  }

  async function disableTwoFactor(payload) {
    return disableTwoFactorRequest(payload)
  }

  async function loadInvites() {
    try {
      const { data } = await api.get('/invites', { params: { $limit: 100 } })
      invites.value = asList(data)
    } catch (error) {
      console.error('Failed to load invites:', error)
    }
  }

  async function createInvite(inviteData) {
    try {
      const { data } = await api.post('/invites', inviteData)
      return data
    } catch (error) {
      console.error('Failed to create invite:', error)
      throw error
    }
  }

  async function revokeInvite(inviteId) {
    try {
      await api.patch(`/invites/${inviteId}`, { status: 'revoked' })
      const index = invites.value.findIndex((invite) => invite.id === inviteId)
      if (index !== -1) {
        invites.value[index].status = 'revoked'
      }
    } catch (error) {
      console.error('Failed to revoke invite:', error)
      throw error
    }
  }

  function applyInviteCreated(invite) {
    if (!invite?.id) return
    if (!invites.value.find((entry) => entry.id === invite.id)) {
      invites.value.unshift(invite)
    }
  }

  function applyInvitePatched(invite) {
    if (!invite?.id) return
    const index = invites.value.findIndex((entry) => entry.id === invite.id)
    if (index !== -1) {
      invites.value[index] = { ...invites.value[index], ...invite }
    }
  }

  async function destroy() {
    initialized = false

    const channelsStore = useChannelsStore()
    const dmsStore = useDmsStore()
    const messagesStore = useMessagesStore()
    const notificationsStore = useNotificationsStore()
    const voiceStore = useVoiceStore()
    const uiStore = useUiStore()
    const meetingsStore = useMeetingsStore()
    const messageSummariesStore = useMessageSummariesStore()

    if (voiceStore.channelId) {
      try {
        await voiceStore.leave()
      } catch {
        // ignore
      }
    }

    disconnectSocket()
    stopSocketAuthenticatedSync?.()
    stopSocketAuthenticatedSync = null
    stopForegroundResumeSync?.()
    stopForegroundResumeSync = null
    stopForegroundChannelTracking?.()
    stopForegroundChannelTracking = null

    channelsStore.reset()
    dmsStore.reset()
    messagesStore.reset()
    notificationsStore.reset()
    voiceStore.reset()
    uiStore.reset()
    meetingsStore.reset()
    messageSummariesStore.reset()
    usePlatformUpdatesStore().reset()
    reset()
  }

  async function logout() {
    useMessagesStore().clearStoredDrafts()
    await destroy()
    await logoutRequest()
    await clearActiveDesktopSession()
    applyLocaleForUser(null)
  }

  async function clearLocalAuthentication() {
    await destroy()
    clearStoredAuth()
    await clearActiveDesktopSession()
    applyLocaleForUser(null)
  }

  async function applyAuthenticationResult(data) {
    await destroy()
    const sessionTransport = getActiveDesktopSessionTransport()
    await completeBrowserAuthentication(data, { remember: false, sessionTransport })
    user.value = normalizeUserPayload(data?.user || getCurrentUser())
    primeUsers(user.value ? [user.value] : [])
    applyLocaleForUser(user.value)
    presenceSyncPending.value = Boolean(user.value)
    await syncActiveDesktopSession({
      accessToken: data?.accessToken || null,
      csrfToken: data?.csrfToken || null,
      refreshToken: data?.refreshToken,
      sessionTransport,
      user: user.value
    })
    if (user.value) {
      await init()
    }
  }

  return {
    user,
    allUsers,
    recentUserIds,
    defaultDirectoryUserIds,
    onlineUserIds,
    presenceLoaded,
    presenceSyncPending,
    lastPresenceRefreshAt,
    permissions,
    platformRoles,
    invites,
    isLoggedIn,
    login,
    beginPasskeyAuthentication,
    verifyPasskeyAuthentication,
    verifyTwoFactorLogin,
    logout,
    clearLocalAuthentication,
    applyAuthenticationResult,
    setupPlatform,
    reset,
    init,
    refreshPermissions,
    hasPermission,
    refreshPresence,
    isOnline,
    resolveUserPresence,
    primeUsers,
    getUserById,
    getUsersByIds,
    getDirectoryUsersByIds,
    getDefaultDirectoryUsers,
    ensureDirectoryUsersLoaded,
    ensureUser,
    ensureUsersByIds,
    reconcilePresenceUsers,
    searchUsers,
    refreshAllUsers,
    updateStatus,
    updateProfile,
    updateMeetingVideoPreferences,
    changePassword,
    getTwoFactorStatus,
    getPasskeys,
    beginPasskeyRegistration,
    verifyPasskeyRegistration,
    deletePasskey,
    beginTwoFactorSetup,
    confirmTwoFactorSetup,
    regenerateTwoFactorRecoveryCodes,
    disableTwoFactor,
    uploadOwnAvatar,
    removeOwnAvatar,
    addOnlineUserId,
    removeOnlineUserId,
    applyUserPatch,
    clearStatusForUser,
    syncForegroundResumeState,
    loadInvites,
    createInvite,
    revokeInvite,
    applyInviteCreated,
    applyInvitePatched,
    destroy
  }
})
