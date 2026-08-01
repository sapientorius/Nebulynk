import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { useChannelsStore } from './channels.js'
import { useSessionStore } from './session.js'

const NOTES_DM_NAME = 'notes'
const DM_CHANNEL_LIST_FRESHNESS_MS = 30_000

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function hasFreshRefreshWindow(lastRefreshedAt) {
  return lastRefreshedAt > 0 && (Date.now() - lastRefreshedAt) < DM_CHANNEL_LIST_FRESHNESS_MS
}

export const useDmsStore = defineStore('dms', () => {
  const dmChannels = ref([])
  const showNewDmModal = ref(false)
  const dmChannelsLoaded = ref(false)
  const lastDmRefreshAt = ref(0)
  let dmRefreshPromise = null

  function primeUsersFromParticipants(dmChannel) {
    const participants = dmChannel?.participants || []
    if (participants.length === 0) return
    useSessionStore().primeUsers(participants.map((participant) => ({
      id: participant.user_id,
      display_name: participant.display_name,
      avatar_url: participant.avatar_url,
      status: participant.status
    })))
  }

  function reset() {
    dmChannels.value = []
    showNewDmModal.value = false
    dmChannelsLoaded.value = false
    lastDmRefreshAt.value = 0
    dmRefreshPromise = null
  }

  function isNotesChannel(dmChannel) {
    const sessionStore = useSessionStore()
    const participants = dmChannel?.participants || []
    return dmChannel?.type === 'dm'
      && dmChannel?.name === NOTES_DM_NAME
      && dmChannel?.created_by === sessionStore.user?.id
      && participants.length === 1
      && participants[0]?.user_id === sessionStore.user?.id
  }

  function sortDmChannels(channels) {
    return [...channels].sort((left, right) => {
      const leftIsNotes = isNotesChannel(left)
      const rightIsNotes = isNotesChannel(right)
      if (leftIsNotes !== rightIsNotes) return leftIsNotes ? -1 : 1

      return new Date(right.last_message_at || right.created_at || 0)
        - new Date(left.last_message_at || left.created_at || 0)
    })
  }

  async function fetchDmChannels() {
    if (dmRefreshPromise) {
      return dmRefreshPromise
    }

    dmRefreshPromise = api.get('/dms')
      .then(({ data }) => {
        dmChannels.value = sortDmChannels(asList(data))
        dmChannels.value.forEach((channel) => primeUsersFromParticipants(channel))
        dmChannelsLoaded.value = true
        lastDmRefreshAt.value = Date.now()
        return dmChannels.value
      })
      .catch((error) => {
        console.error('Failed to load DMs:', error)
        throw error
      })
      .finally(() => {
        dmRefreshPromise = null
      })

    return dmRefreshPromise
  }

  async function refresh({ force = false } = {}) {
    if (force) {
      return fetchDmChannels()
    }

    if (!dmChannelsLoaded.value) {
      return fetchDmChannels()
    }

    if (hasFreshRefreshWindow(lastDmRefreshAt.value)) {
      return dmChannels.value
    }

    fetchDmChannels().catch(() => {})
    return dmChannels.value
  }

  async function refreshChannel(channelId) {
    if (!channelId) return null

    try {
      const { data } = await api.get(`/dms/${channelId}`)
      primeUsersFromParticipants(data)
      const index = dmChannels.value.findIndex((entry) => entry.id === channelId)
      if (index !== -1) {
        dmChannels.value[index] = { ...dmChannels.value[index], ...data }
      } else {
        dmChannels.value.unshift(data)
      }
      dmChannels.value = sortDmChannels(dmChannels.value)
      return data
    } catch (error) {
      const status = error?.response?.status
      if (status === 403 || status === 404) {
        removeChannel(channelId)
        return null
      }

      console.error('Failed to refresh DM channel:', error)
      throw error
    }
  }

  async function openOrCreate(userId) {
    try {
      const { data } = await api.post('/dms', { user_ids: [userId] })
      primeUsersFromParticipants(data)
      ensureChannel(data)
      const channelsStore = useChannelsStore()
      await channelsStore.select(data.id)
      return data
    } catch (error) {
      console.error('Failed to create/open DM:', error)
      throw error
    }
  }

  async function createGroup(userIds, name = '') {
    try {
      const { data } = await api.post('/dms', { user_ids: userIds, name: name || undefined })
      primeUsersFromParticipants(data)
      ensureChannel(data)
      const channelsStore = useChannelsStore()
      await channelsStore.select(data.id)
      return data
    } catch (error) {
      console.error('Failed to create group DM:', error)
      throw error
    }
  }

  async function update(channelId, payload) {
    try {
      const response = await api.patch(`/dms/${channelId}`, payload)
      const updated = response.data
      primeUsersFromParticipants(updated)
      const index = dmChannels.value.findIndex((channel) => channel.id === channelId)
      if (index !== -1) {
        dmChannels.value[index] = { ...dmChannels.value[index], ...updated }
      }
      return updated
    } catch (error) {
      console.error('Failed to update DM channel:', error)
      throw error
    }
  }

  async function leaveGroup(channelId) {
    const channelsStore = useChannelsStore()
    await channelsStore.leaveChannel(channelId)
    removeChannel(channelId)
  }

  function displayInfo(dmChannel) {
    const sessionStore = useSessionStore()
    const selfId = sessionStore.user?.id

    if (isNotesChannel(dmChannel)) {
      return {
        name: t('common.notes'),
        avatarInitial: 'N',
        avatarUrl: null,
        userId: selfId,
        isOnline: null,
        status: null,
        badgeStatus: null,
        memberCount: 1
      }
    }

    if (dmChannel.type === 'dm') {
      const other = dmChannel.participants?.find((participant) => participant.user_id !== selfId)
      const liveUser = other ? sessionStore.getUserById(other.user_id) : null
      const presenceState = sessionStore.resolveUserPresence(
        liveUser || {
          id: other?.user_id,
          status: other?.status || 'offline'
        }
      )
      return {
        name: liveUser?.display_name || other?.display_name || 'Unbekannt',
        avatarInitial: (liveUser?.display_name || other?.display_name || '?')[0].toUpperCase(),
        avatarUrl: liveUser?.avatar_url || other?.avatar_url,
        userId: other?.user_id,
        isOnline: presenceState.isConnected,
        status: presenceState.displayStatus,
        badgeStatus: presenceState.badgeStatus,
        memberCount: 2
      }
    }

    if (dmChannel.name && !dmChannel.name.startsWith('group-')) {
      return {
        name: dmChannel.name,
        avatarInitial: dmChannel.name[0].toUpperCase(),
        avatarUrl: null,
        userId: null,
        isOnline: null,
        status: null,
        badgeStatus: null,
        memberCount: dmChannel.participants?.length || 0
      }
    }

    const otherNames = (dmChannel.participants || [])
      .filter((participant) => participant.user_id !== selfId)
      .map((participant) => participant.display_name || 'Unbekannt')
    const displayName = otherNames.join(', ')

    return {
      name: displayName || 'Gruppenchat',
      avatarInitial: (otherNames[0] || '?')[0].toUpperCase(),
      avatarUrl: null,
      userId: null,
      isOnline: null,
      status: null,
      badgeStatus: null,
      memberCount: dmChannel.participants?.length || 0
    }
  }

  function hasDmChannel(channelId) {
    return dmChannels.value.some((channel) => channel.id === channelId)
  }

  function ensureChannel(channel) {
    if (!channel?.id) return
    if (!hasDmChannel(channel.id)) {
      dmChannels.value.unshift(channel)
    }
    dmChannels.value = sortDmChannels(dmChannels.value)
  }

  function patchChannel(channel) {
    if (!channel?.id) return
    const index = dmChannels.value.findIndex((entry) => entry.id === channel.id)
    if (index !== -1) {
      dmChannels.value[index] = { ...dmChannels.value[index], ...channel }
      dmChannels.value = sortDmChannels(dmChannels.value)
    }
  }

  function removeChannel(channelId) {
    dmChannels.value = dmChannels.value.filter((channel) => channel.id !== channelId)
  }

  function bumpChannelByMessage(channelId, createdAt) {
    const index = dmChannels.value.findIndex((channel) => channel.id === channelId)
    if (index > 0) {
      const [dm] = dmChannels.value.splice(index, 1)
      dm.last_message_at = createdAt
      dmChannels.value.unshift(dm)
      dmChannels.value = sortDmChannels(dmChannels.value)
      return
    }

    if (index === 0) {
      dmChannels.value[0] = {
        ...dmChannels.value[0],
        last_message_at: createdAt
      }
      dmChannels.value = sortDmChannels(dmChannels.value)
    }
  }

  async function openNotes() {
    let notesChannel = dmChannels.value.find((channel) => isNotesChannel(channel))
    if (!notesChannel) {
      await refresh({ force: true })
      notesChannel = dmChannels.value.find((channel) => isNotesChannel(channel))
    }
    if (!notesChannel?.id) return null

    const channelsStore = useChannelsStore()
    await channelsStore.select(notesChannel.id)
    const { default: router } = await import('../router/index.js')
    await router.push(`/channels/${notesChannel.id}`).catch(() => {})
    return notesChannel
  }

  return {
    dmChannels,
    showNewDmModal,
    reset,
    refresh,
    refreshChannel,
    openOrCreate,
    createGroup,
    update,
    leaveGroup,
    displayInfo,
    isNotesChannel,
    openNotes,
    hasDmChannel,
    ensureChannel,
    patchChannel,
    removeChannel,
    bumpChannelByMessage
  }
})
