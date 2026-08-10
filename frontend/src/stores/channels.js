import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import { getApiErrorCode } from '../lib/api-error.js'
import { useSessionStore } from './session.js'
import { useDmsStore } from './dms.js'
import { useMessagesStore } from './messages.js'

const READ_WATERMARK_DEBOUNCE_MS = 250
const CHANNEL_LIST_FRESHNESS_MS = 30_000
const READ_WATERMARK_MEMBERSHIP_REQUIRED_ERROR = 'api.channels.membership_required'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function toTimestamp(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function maxIsoTimestamp(left, right) {
  const leftTime = toTimestamp(left)
  const rightTime = toTimestamp(right)
  if (leftTime === null) return right || null
  if (rightTime === null) return left || null
  return rightTime > leftTime ? right : left
}

function isMeetingChannel(channel) {
  return channel?.purpose === 'meeting'
}

function isArchivedStandardChannel(channel) {
  return !isMeetingChannel(channel) && !!channel?.is_archived
}

function isUnarchivedStandardChannel(channel) {
  return !isMeetingChannel(channel) && !channel?.is_archived
}

function upsertChannelListEntry(list, channel, { prepend = false } = {}) {
  const index = list.findIndex((entry) => entry.id === channel.id)
  if (index === -1) {
    return prepend ? [channel, ...list] : [...list, channel]
  }

  const next = [...list]
  next[index] = { ...next[index], ...channel }
  return next
}

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref([])
  const archivedChannels = ref([])
  const activeChannelId = ref(null)
  const members = ref([])
  const myMembership = ref(null)
  const channelRole = ref(null)
  const unreadCounts = ref({})
  const viewportStateByChannel = ref({})
  const optimisticReadStateByChannel = ref({})
  const standardChannelsLoaded = ref(false)
  const archivedChannelsLoaded = ref(false)
  const lastStandardChannelsRefreshAt = ref(0)
  const lastArchivedChannelsRefreshAt = ref(0)
  const permissions = computed(() => useSessionStore().permissions)
  const pendingReadWatermarks = new Map()
  const inFlightReadWatermarks = new Map()
  const flushTimers = new Map()
  const readStateBlockedChannelIds = new Set()
  let readLifecycleBound = false
  let standardChannelsRefreshPromise = null
  let archivedChannelsRefreshPromise = null

  function clearFlushTimer(channelId) {
    const timerId = flushTimers.get(channelId)
    if (timerId) {
      clearTimeout(timerId)
      flushTimers.delete(channelId)
    }
  }

  function setOptimisticReadState(channelId, lastReadAt) {
    const current = optimisticReadStateByChannel.value[channelId]
    optimisticReadStateByChannel.value = {
      ...optimisticReadStateByChannel.value,
      [channelId]: maxIsoTimestamp(current, lastReadAt)
    }
  }

  function clearOptimisticReadState(channelId) {
    if (!optimisticReadStateByChannel.value[channelId]) return
    const next = { ...optimisticReadStateByChannel.value }
    delete next[channelId]
    optimisticReadStateByChannel.value = next
  }

  function discardReadWatermark(channelId) {
    clearFlushTimer(channelId)
    pendingReadWatermarks.delete(channelId)
    clearOptimisticReadState(channelId)
  }

  function isMembershipRequiredReadStateError(error) {
    return error?.response?.status === 403
      && getApiErrorCode(error) === READ_WATERMARK_MEMBERSHIP_REQUIRED_ERROR
  }

  function canQueueReadWatermark(channelId) {
    if (readStateBlockedChannelIds.has(channelId)) return false
    return channelId !== activeChannelId.value || !!myMembership.value
  }

  function scheduleReadWatermarkFlush(channelId) {
    if (!channelId) return
    clearFlushTimer(channelId)
    const timerId = setTimeout(() => {
      flushTimers.delete(channelId)
      flushReadWatermark(channelId).catch(() => {})
    }, READ_WATERMARK_DEBOUNCE_MS)
    flushTimers.set(channelId, timerId)
  }

  function bindReadLifecycleIfNeeded() {
    if (readLifecycleBound || typeof window === 'undefined' || typeof document === 'undefined') return

    const flushPendingReadState = () => {
      flushAllReadWatermarks().catch(() => {})
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushPendingReadState()
      }
    })
    window.addEventListener('pagehide', flushPendingReadState)
    window.addEventListener('beforeunload', flushPendingReadState)
    readLifecycleBound = true
  }

  function hasFreshRefreshWindow(lastRefreshedAt) {
    return lastRefreshedAt > 0 && (Date.now() - lastRefreshedAt) < CHANNEL_LIST_FRESHNESS_MS
  }

  function replaceStandardChannels(nextStandardChannels) {
    const meetingChannels = channels.value.filter((channel) => isMeetingChannel(channel))
    channels.value = [...nextStandardChannels.filter(isUnarchivedStandardChannel), ...meetingChannels]
  }

  function replaceArchivedChannelList(nextArchivedChannels) {
    archivedChannels.value = nextArchivedChannels.filter(isArchivedStandardChannel)
  }

  function applyChannelRecord(channel, options = {}) {
    if (!channel?.id) return null

    if (isMeetingChannel(channel)) {
      archivedChannels.value = archivedChannels.value.filter((entry) => entry.id !== channel.id)
      channels.value = upsertChannelListEntry(channels.value, channel, options)
      return channel
    }

    if (channel.is_archived) {
      channels.value = channels.value.filter((entry) => entry.id !== channel.id)
      archivedChannels.value = upsertChannelListEntry(archivedChannels.value, channel, options)
      return channel
    }

    archivedChannels.value = archivedChannels.value.filter((entry) => entry.id !== channel.id)
    channels.value = upsertChannelListEntry(channels.value, channel, options)
    return channel
  }

  async function fetchStandardChannels() {
    if (standardChannelsRefreshPromise) {
      return standardChannelsRefreshPromise
    }

    standardChannelsRefreshPromise = api.get('/channels', {
      params: { $limit: 100 }
    })
      .then(({ data }) => {
        replaceStandardChannels(asList(data))
        standardChannelsLoaded.value = true
        lastStandardChannelsRefreshAt.value = Date.now()
        return channels.value
      })
      .catch((error) => {
        console.error('Failed to load channels:', error)
        throw error
      })
      .finally(() => {
        standardChannelsRefreshPromise = null
      })

    return standardChannelsRefreshPromise
  }

  async function fetchArchivedChannels() {
    if (archivedChannelsRefreshPromise) {
      return archivedChannelsRefreshPromise
    }

    archivedChannelsRefreshPromise = api.get('/channels', {
      params: { $limit: 100, include_archived: true }
    })
      .then(({ data }) => {
        replaceArchivedChannelList(asList(data))
        archivedChannelsLoaded.value = true
        lastArchivedChannelsRefreshAt.value = Date.now()
        return archivedChannels.value
      })
      .catch((error) => {
        console.error('Failed to load archived channels:', error)
        throw error
      })
      .finally(() => {
        archivedChannelsRefreshPromise = null
      })

    return archivedChannelsRefreshPromise
  }

  function reset() {
    for (const timerId of flushTimers.values()) {
      clearTimeout(timerId)
    }
    flushTimers.clear()
    pendingReadWatermarks.clear()
    inFlightReadWatermarks.clear()
    readStateBlockedChannelIds.clear()
    standardChannelsRefreshPromise = null
    archivedChannelsRefreshPromise = null
    channels.value = []
    archivedChannels.value = []
    activeChannelId.value = null
    members.value = []
    myMembership.value = null
    channelRole.value = null
    unreadCounts.value = {}
    viewportStateByChannel.value = {}
    optimisticReadStateByChannel.value = {}
    standardChannelsLoaded.value = false
    archivedChannelsLoaded.value = false
    lastStandardChannelsRefreshAt.value = 0
    lastArchivedChannelsRefreshAt.value = 0
  }

  async function refresh({ force = false } = {}) {
    if (force) {
      return fetchStandardChannels()
    }

    if (!standardChannelsLoaded.value) {
      return fetchStandardChannels()
    }

    if (hasFreshRefreshWindow(lastStandardChannelsRefreshAt.value)) {
      return channels.value
    }

    fetchStandardChannels().catch(() => {})
    return channels.value
  }

  async function refreshArchived({ force = false } = {}) {
    if (force) {
      return fetchArchivedChannels()
    }

    if (!archivedChannelsLoaded.value) {
      return fetchArchivedChannels()
    }

    if (hasFreshRefreshWindow(lastArchivedChannelsRefreshAt.value)) {
      return archivedChannels.value
    }

    fetchArchivedChannels().catch(() => {})
    return archivedChannels.value
  }

  async function refreshChannel(channelId, options = {}) {
    if (!channelId) return null

    const { removeOnMissing = true } = options

    try {
      const { data } = await api.get(`/channels/${channelId}`)
      return applyChannelRecord(data, { prepend: true })
    } catch (error) {
      const status = error?.response?.status
      if (removeOnMissing && (status === 403 || status === 404)) {
        removeChannel(channelId)
        return null
      }

      console.error('Failed to refresh channel:', error)
      throw error
    }
  }

  async function discoverPublic(searchTerm = '') {
    try {
      const { data } = await api.get('/channels', {
        params: { $limit: 100, discover_public: true }
      })
      const items = asList(data)
      const term = (searchTerm || '').trim().toLowerCase()
      if (!term) return items
      return items.filter((channel) => (
        channel.name?.toLowerCase().includes(term)
        || channel.description?.toLowerCase().includes(term)
        || channel.topic?.toLowerCase().includes(term)
      ))
    } catch (error) {
      console.error('Failed to discover public channels:', error)
      return []
    }
  }

  async function create(name, type = 'public', description = '', isVoice = false, initialUserIds = []) {
    try {
      const payload = { name, type, description }
      if (isVoice) payload.is_voice = true
      const uniqueInitialIds = [...new Set((initialUserIds || []).filter(Boolean))]
      if (uniqueInitialIds.length > 0) {
        payload.initial_user_ids = uniqueInitialIds
      }
      const { data } = await api.post('/channels', payload)
      return applyChannelRecord(data)
    } catch (error) {
      console.error('Failed to create channel:', error)
      throw error
    }
  }

  async function update(channelId, payload) {
    try {
      const response = await api.patch(`/channels/${channelId}`, payload)
      const updated = response.data
      return applyChannelRecord(updated)
    } catch (error) {
      console.error('Failed to update channel:', error)
      throw error
    }
  }

  async function joinPublic(channelId) {
    const sessionStore = useSessionStore()
    const userId = sessionStore.user?.id
    if (!channelId || !userId) return null

    try {
      await api.post('/channel-members', {
        channel_id: channelId,
        user_id: userId
      })
    } catch (error) {
      const status = error?.response?.status
      if (status !== 409) {
        console.error('Failed to join public channel:', error)
        throw error
      }
    }

    await refresh({ force: true })
    return channels.value.find((channel) => channel.id === channelId) || null
  }

  async function leaveChannel(channelId) {
    const sessionStore = useSessionStore()
    const userId = sessionStore.user?.id
    if (!channelId || !userId) return false

    const { data } = await api.get('/channel-members', {
      params: {
        channel_id: channelId,
        user_id: userId,
        $limit: 1
      }
    })
    const memberships = asList(data)
    if (memberships.length === 0) {
      return false
    }

    await api.delete(`/channel-members/${memberships[0].id}`)
    removeChannel(channelId)
    if (activeChannelId.value === channelId) {
      clearActiveContext()
    }
    return true
  }

  async function select(channelId) {
    const messagesStore = useMessagesStore()
    const previousChannelId = activeChannelId.value
    const selectedChannel = channels.value.find((channel) => channel.id === channelId)
      || useDmsStore().dmChannels.find((channel) => channel.id === channelId)

    if (previousChannelId && previousChannelId !== channelId) {
      await flushReadWatermark(previousChannelId).catch(() => {})
    }

    activeChannelId.value = channelId
    members.value = []
    myMembership.value = null
    channelRole.value = null
    messagesStore.resetChannelMessages()
    clearUnread(channelId)

    await messagesStore.loadLatest()
    await refreshMembers(channelId)
    if (activeChannelId.value !== channelId) return

    await messagesStore.loadPins(channelId)
    if (activeChannelId.value !== channelId) return
    await loadChannelPermissions(channelId)
    if (activeChannelId.value !== channelId) return

    const latestVisibleAt = messagesStore.messages[messagesStore.messages.length - 1]?.created_at || null
    if (latestVisibleAt) {
      setChannelViewportState(channelId, {
        atBottom: true,
        latestVisibleAt
      })
      await queueReadWatermark(channelId, latestVisibleAt, { immediate: true }).catch(() => {})
    } else if (selectedChannel?.purpose === 'meeting') {
      await queueReadWatermark(channelId, new Date().toISOString(), { immediate: true }).catch(() => {})
    }
  }

  async function refreshMembers(channelId = activeChannelId.value) {
    if (!channelId) return []
    try {
      const { data } = await api.get('/channel-members', {
        params: { channel_id: channelId, $limit: 100 }
      })
      if (activeChannelId.value !== channelId) return []

      members.value = asList(data)
      myMembership.value = members.value.find((member) => member.user_id === useSessionStore().user?.id) || null
      if (myMembership.value) {
        readStateBlockedChannelIds.delete(channelId)
      }
      return members.value
    } catch (error) {
      console.error('Failed to load members:', error)
      return []
    }
  }

  async function loadChannelPermissions(channelId) {
    try {
      const { data } = await api.get('/my-permissions', {
        params: { channel_id: channelId }
      })
      const sessionStore = useSessionStore()
      sessionStore.permissions = data.permissions || []
      channelRole.value = data.channelRole || null
    } catch (error) {
      console.error('Failed to load channel permissions:', error)
    }
  }

  async function refreshPermissions() {
    await useSessionStore().refreshPermissions()
  }

  async function flushReadWatermark(channelId) {
    if (!channelId) return null
    bindReadLifecycleIfNeeded()
    clearFlushTimer(channelId)

    const pendingLastReadAt = pendingReadWatermarks.get(channelId)
    if (!pendingLastReadAt) {
      return inFlightReadWatermarks.get(channelId)?.promise || null
    }

    const sessionStore = useSessionStore()
    if (!sessionStore.user?.id) return

    if (inFlightReadWatermarks.has(channelId)) {
      return inFlightReadWatermarks.get(channelId).promise
    }

    pendingReadWatermarks.delete(channelId)

    const request = api.patch('/channel-read-state', {
      channel_id: channelId,
      last_read_at: pendingLastReadAt
    })
      .then(({ data }) => {
        const optimisticLastReadAt = optimisticReadStateByChannel.value[channelId]
        const hasNewerOptimisticState = toTimestamp(optimisticLastReadAt) > toTimestamp(pendingLastReadAt)
        const nextPendingLastReadAt = pendingReadWatermarks.get(channelId)
        if (!hasNewerOptimisticState && !nextPendingLastReadAt) {
          clearOptimisticReadState(channelId)
        }
        return data
      })
      .catch((error) => {
        if (isMembershipRequiredReadStateError(error)) {
          readStateBlockedChannelIds.add(channelId)
          discardReadWatermark(channelId)
        } else {
          pendingReadWatermarks.set(
            channelId,
            maxIsoTimestamp(pendingReadWatermarks.get(channelId), pendingLastReadAt)
          )
        }
        throw error
      })
      .finally(() => {
        inFlightReadWatermarks.delete(channelId)
        if (pendingReadWatermarks.get(channelId)) {
          scheduleReadWatermarkFlush(channelId)
        }
      })

    inFlightReadWatermarks.set(channelId, {
      lastReadAt: pendingLastReadAt,
      promise: request
    })

    return request
  }

  async function flushAllReadWatermarks() {
    const channelIds = new Set([
      ...pendingReadWatermarks.keys(),
      ...inFlightReadWatermarks.keys()
    ])

    await Promise.all([...channelIds].map((channelId) => flushReadWatermark(channelId).catch(() => null)))
  }

  async function queueReadWatermark(channelId, lastReadAt, { immediate = false } = {}) {
    const sessionStore = useSessionStore()
    if (!sessionStore.user?.id || !channelId || !lastReadAt || !canQueueReadWatermark(channelId)) return null

    bindReadLifecycleIfNeeded()
    pendingReadWatermarks.set(
      channelId,
      maxIsoTimestamp(pendingReadWatermarks.get(channelId), lastReadAt)
    )
    setOptimisticReadState(channelId, lastReadAt)
    clearUnread(channelId)

    if (immediate) {
      return flushReadWatermark(channelId)
    }

    scheduleReadWatermarkFlush(channelId)
    return null
  }

  function setChannelViewportState(channelId, { atBottom, latestVisibleAt } = {}) {
    if (!channelId) return
    const current = viewportStateByChannel.value[channelId] || {}

    viewportStateByChannel.value = {
      ...viewportStateByChannel.value,
      [channelId]: {
        atBottom: Boolean(atBottom),
        latestVisibleAt: latestVisibleAt || current.latestVisibleAt || null
      }
    }
  }

  function isChannelInReadViewport(channelId) {
    return Boolean(viewportStateByChannel.value[channelId]?.atBottom)
  }

  async function markAsRead(channelId, lastReadAt = new Date().toISOString()) {
    if (!channelId) return null

    try {
      return await queueReadWatermark(channelId, lastReadAt, { immediate: true })
    } catch {
      // ignore
      return null
    }
  }

  function can(permissionName) {
    return useSessionStore().hasPermission(permissionName)
  }

  function firstUnarchivedChannelId() {
    const firstText = channels.value.find((channel) => (
      !channel.is_archived
      && !channel.is_voice
      && channel.purpose !== 'meeting'
    ))
    if (firstText) return firstText.id

    const dmsStore = useDmsStore()
    const firstDm = dmsStore.dmChannels[0]
    if (firstDm) return firstDm.id
    return null
  }

  function isKnownTextChannel(channelId) {
    return channels.value.some((channel) => channel.id === channelId)
  }

  function hasChannel(channelId) {
    return channels.value.some((channel) => channel.id === channelId)
  }

  function addChannel(channel) {
    applyChannelRecord(channel)
  }

  function patchChannel(channel) {
    applyChannelRecord(channel)
  }

  function removeChannel(channelId) {
    discardReadWatermark(channelId)
    readStateBlockedChannelIds.delete(channelId)
    channels.value = channels.value.filter((entry) => entry.id !== channelId)
    archivedChannels.value = archivedChannels.value.filter((entry) => entry.id !== channelId)
  }

  function setUnreadCounts(counts) {
    const nextCounts = { ...(counts || {}) }
    for (const [channelId, optimisticReadAt] of Object.entries(optimisticReadStateByChannel.value)) {
      if (!optimisticReadAt) continue
      if ((unreadCounts.value[channelId] || 0) > 0) continue
      nextCounts[channelId] = 0
    }
    unreadCounts.value = nextCounts
  }

  function clearUnread(channelId) {
    unreadCounts.value = { ...unreadCounts.value, [channelId]: 0 }
  }

  function incrementUnread(channelId) {
    unreadCounts.value = {
      ...unreadCounts.value,
      [channelId]: (unreadCounts.value[channelId] || 0) + 1
    }
  }

  function clearActiveContext() {
    activeChannelId.value = null
    members.value = []
    myMembership.value = null
    useMessagesStore().resetChannelMessages()
  }

  return {
    channels,
    archivedChannels,
    activeChannelId,
    members,
    permissions,
    unreadCounts,
    myMembership,
    channelRole,
    reset,
    refresh,
    refreshArchived,
    refreshChannel,
    discoverPublic,
    select,
    create,
    joinPublic,
    leaveChannel,
    update,
    refreshMembers,
    loadChannelPermissions,
    refreshPermissions,
    queueReadWatermark,
    flushReadWatermark,
    flushAllReadWatermarks,
    setChannelViewportState,
    isChannelInReadViewport,
    markAsRead,
    can,
    firstUnarchivedChannelId,
    isKnownTextChannel,
    hasChannel,
    addChannel,
    patchChannel,
    removeChannel,
    setUnreadCounts,
    clearUnread,
    incrementUnread,
    clearActiveContext
  }
})
