import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import {
  applyScreenShareViewQuality as applyLivekitScreenShareViewQuality,
  connectToRoom,
  disconnectFromRoom,
  getActiveVideoInputDevice,
  getVideoInputDevices,
  hasBackgroundBlurEnabled,
  isBackgroundBlurSupported as detectBackgroundBlurSupport,
  isModernBackgroundBlurSupported as detectModernBackgroundBlurSupport,
  setCallbacks,
  setBackgroundBlurEnabled as applyBackgroundBlurToRoom,
  setVirtualBackgroundImage as applyVirtualBackgroundImageToRoom,
  setRemoteCameraSubscription as applyRemoteCameraSubscriptionToRoom,
  setDeafened,
  setMasterVolume,
  setVideoInputDevice as applyVideoInputDeviceToRoom,
  startCamera as publishCamera,
  startScreenShare as publishScreenShare,
  stopCamera as unpublishCamera,
  stopScreenShare as unpublishScreenShare
} from '../lib/livekit.js'
import {
  DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY,
  DEFAULT_SCREEN_SHARE_VIEW_QUALITY,
  SCREEN_SHARE_PUBLISH_STORAGE_KEY,
  SCREEN_SHARE_VIEW_STORAGE_KEY,
  normalizeScreenSharePublishQuality,
  normalizeScreenShareViewQuality
} from '../lib/screen-share-quality.js'
import * as micActivation from '../lib/mic-activation.js'
import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import { t } from '../lib/i18n.js'
import { getApiErrorMessage } from '../lib/api-error.js'
import { normalizeMeetingVideoPreferences } from '../lib/meeting-video-preferences.js'
import { requestMicrophonePermission } from '../lib/microphone-permission.js'
import { useSessionStore } from './session.js'
import { useChannelsStore } from './channels.js'
import { useVideoBackgroundsStore } from './video-backgrounds.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function resolveVoiceChannelName(channel) {
  if (!channel) return 'Voice'

  const topic = typeof channel.topic === 'string' ? channel.topic.trim() : ''
  if (channel.purpose === 'meeting' && topic) {
    return topic
  }

  const name = typeof channel.name === 'string' ? channel.name.trim() : ''
  return name || 'Voice'
}

function normalizeScreenSharePayload(payload = {}) {
  const participantId = payload.participantId || null
  return {
    participantId,
    participantName: payload.participantName || null,
    track: payload.track || null,
    publication: payload.publication || null,
    isLocal: !!payload.isLocal,
    hasAudio: !!payload.hasAudio,
    qualityProfile: payload.qualityProfile || null
  }
}

function normalizeCameraPayload(payload = {}) {
  const participantId = payload.participantId || null
  return {
    participantId,
    participantName: payload.participantName || null,
    track: payload.track || null,
    publication: payload.publication || null,
    isLocal: !!payload.isLocal
  }
}

function loadScreenSharePublishQuality() {
  if (typeof localStorage === 'undefined') return DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY
  return normalizeScreenSharePublishQuality(localStorage.getItem(SCREEN_SHARE_PUBLISH_STORAGE_KEY))
}

function loadScreenShareViewQuality() {
  if (typeof localStorage === 'undefined') return DEFAULT_SCREEN_SHARE_VIEW_QUALITY
  return normalizeScreenShareViewQuality(localStorage.getItem(SCREEN_SHARE_VIEW_STORAGE_KEY))
}

export const useVoiceStore = defineStore('voice', () => {
  const channelId = ref(null)
  const channelName = ref(null)
  const participants = ref({})
  const muted = ref(false)
  const manualMuted = ref(false)
  const deafened = ref(false)
  const connecting = ref(false)
  const connected = ref(false)
  const activeSpeakers = ref([])
  const showSettings = ref(false)
  const settingsTab = ref('audio')
  const micModeState = ref('live')
  const transmitting = ref(true)
  const screenSharesByChannel = ref({})
  const cameraTracksByChannel = ref({})
  const screenShareError = ref(null)
  const cameraError = ref(null)
  const backgroundBlurError = ref(null)
  const cameraEnabled = ref(false)
  const backgroundBlurApplied = ref(false)
  const backgroundImageApplied = ref(false)
  const activeCameraDeviceId = ref(null)
  const meetingVideoEnabled = ref(false)
  const allRemoteCameraSubscriptionsEnabled = ref(true)
  const disabledRemoteCameraParticipantIds = ref({})
  const pinnedShareParticipantId = ref(null)
  const screenSharePublishQuality = ref(loadScreenSharePublishQuality())
  const screenShareViewQuality = ref(loadScreenShareViewQuality())
  let activeConnectionAttempt = 0

  const currentScreenShares = computed(() => {
    if (!channelId.value) return []
    return screenSharesByChannel.value[channelId.value] || []
  })

  const activeScreenShare = computed(() => {
    const shares = currentScreenShares.value
    if (shares.length === 0) return null

    if (pinnedShareParticipantId.value) {
      const pinned = shares.find((entry) => entry.participantId === pinnedShareParticipantId.value)
      if (pinned) return pinned
    }

    const local = shares.find((entry) => entry.isLocal)
    return local || shares[0]
  })

  const isSharingScreen = computed(() => currentScreenShares.value.some((entry) => entry.isLocal))

  const currentCameraTracks = computed(() => {
    if (!channelId.value) return []
    return (cameraTracksByChannel.value[channelId.value] || []).filter((entry) => !!entry.track)
  })

  const meetingVideoPreferences = computed(() => normalizeMeetingVideoPreferences(useSessionStore().user?.meeting_video_preferences))

  const preferredCameraDeviceId = computed(() => meetingVideoPreferences.value.preferred_camera_device_id)

  const backgroundBlurEnabledPreference = computed(() => meetingVideoPreferences.value.background_mode === 'blur')
  const backgroundImageEnabledPreference = computed(() => meetingVideoPreferences.value.background_mode === 'image')
  const backgroundImagePreferenceId = computed(() => meetingVideoPreferences.value.background_image_id)

  const backgroundBlurSupported = computed(() => detectBackgroundBlurSupport())

  const modernBackgroundBlurSupported = computed(() => detectModernBackgroundBlurSupport())

  const micMode = computed({
    get: () => micModeState.value,
    set: (mode) => setMicMode(mode)
  })

  function primeVoiceUsers(voiceParticipants = []) {
    if (!Array.isArray(voiceParticipants) || voiceParticipants.length === 0) return
    useSessionStore().primeUsers(voiceParticipants.map((participant) => ({
      id: participant.user_id,
      display_name: participant.display_name,
      avatar_url: participant.avatar_url,
      status: participant.status
    })))
  }

  function applySavedVolume() {
    const saved = localStorage.getItem('voiceMasterVolume')
    if (saved !== null) {
      const volume = parseInt(saved, 10)
      if (!Number.isNaN(volume)) {
        setMasterVolume(volume / 100)
      }
    }
  }

  function setupVoiceCallbacks() {
    setCallbacks({
      onActiveSpeakersChanged(speakerIds) {
        activeSpeakers.value = speakerIds
      },
      onDisconnected() {
        connected.value = false
        activeSpeakers.value = []
        clearScreenShares(channelId.value)
        clearCameraTracks(channelId.value)
        cameraEnabled.value = false
        backgroundBlurApplied.value = false
        activeCameraDeviceId.value = null
        pinnedShareParticipantId.value = null
        screenShareError.value = null
        cameraError.value = null
        backgroundBlurError.value = null
      },
      onScreenShareStarted(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        upsertScreenShare(targetChannelId, payload)
        if (!payload?.isLocal) {
          applyScreenShareViewQuality(normalizeScreenSharePayload(payload))
        }
      },
      onScreenShareStopped(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        removeScreenShare(targetChannelId, payload?.participantId || null)
      },
      onCameraStarted(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        upsertCameraTrack(targetChannelId, payload)
        if (payload?.isLocal) {
          cameraEnabled.value = true
          backgroundBlurApplied.value = hasBackgroundBlurEnabled()
          activeCameraDeviceId.value = getActiveVideoInputDevice() || activeCameraDeviceId.value || null
          updateSelfParticipantState(targetChannelId, { is_video_enabled: true })
        }
      },
      onCameraStopped(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        clearCameraTrack(targetChannelId, payload?.participantId || null)
        if (payload?.isLocal) {
          cameraEnabled.value = false
          backgroundBlurApplied.value = false
          activeCameraDeviceId.value = null
          updateSelfParticipantState(targetChannelId, { is_video_enabled: false })
        }
      },
      onCameraPublished(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        upsertCameraTrack(targetChannelId, payload)
        if (!payload?.isLocal) {
          applyRemoteCameraSubscriptionPreference(payload?.participantId || null)
        }
      },
      onCameraUnpublished(payload) {
        const targetChannelId = channelId.value
        if (!targetChannelId) return
        removeCameraTrack(targetChannelId, payload?.participantId || null)
      }
    })
  }

  function persistScreenSharePublishQuality(value) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SCREEN_SHARE_PUBLISH_STORAGE_KEY, value)
  }

  function persistScreenShareViewQuality(value) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SCREEN_SHARE_VIEW_STORAGE_KEY, value)
  }

  function beginConnectionAttempt(targetChannelId) {
    activeConnectionAttempt += 1
    connecting.value = true
    connected.value = false
    channelId.value = targetChannelId
    return activeConnectionAttempt
  }

  function isCurrentConnectionAttempt(attemptId) {
    return attemptId === activeConnectionAttempt
  }

  function cancelPendingConnection() {
    activeConnectionAttempt += 1
    connecting.value = false
  }

  async function preflightMicrophonePermission() {
    const result = await requestMicrophonePermission()
    if (result?.granted === false) {
      globalThis.window?.$message?.warning?.(t('ui.stores.microphone_permission_denied_listen_only'))
    }
    return result
  }

  async function connectWithPayload(payload, options = {}) {
    const targetChannelId = options.channelId || payload?.channelId || channelId.value
    if (!targetChannelId) {
      throw new Error('Missing channel for voice connection')
    }
    if (!payload?.token || !payload?.url) {
      throw new Error('Missing voice session payload')
    }

    const connectionAttemptId = beginConnectionAttempt(targetChannelId)
    setupVoiceCallbacks()
    channelName.value = payload.channelName || channelName.value || 'Voice'
    participants.value = {
      ...participants.value,
      [targetChannelId]: payload.participants || participants.value[targetChannelId] || []
    }
    meetingVideoEnabled.value = payload?.features?.meeting_video_enabled === true
    primeVoiceUsers(payload.participants)

    try {
      let microphonePermission = null
      if (options.requestMicrophonePermission === true) {
        microphonePermission = await preflightMicrophonePermission()
        if (!isCurrentConnectionAttempt(connectionAttemptId)) {
          return false
        }
      }

      try {
        await connectToRoom(payload.token, payload.url)
      } catch (error) {
        console.warn('Initial voice connect failed, retrying once:', error)
        await connectToRoom(payload.token, payload.url)
      }

      if (!isCurrentConnectionAttempt(connectionAttemptId)) {
        await disconnectFromRoom({ suppressErrors: true })
        return false
      }

      connected.value = true
      muted.value = microphonePermission?.granted === false
      deafened.value = false
      manualMuted.value = microphonePermission?.granted === false
      transmitting.value = microphonePermission?.granted !== false

      if (options.playJoinSfx !== false) {
        playSfx(SFX_EVENTS.VOICE_JOIN_SELF)
      }

      applySavedVolume()

      micActivation.init({
        onTransmitChange(nextTransmitting) {
          transmitting.value = nextTransmitting
        }
      })
      micModeState.value = micActivation.getMode()
      micActivation.setMode(micModeState.value)
      if (microphonePermission?.granted === false) {
        micActivation.setManualMute(true)
      }
      return true
    } catch (error) {
      if (isCurrentConnectionAttempt(connectionAttemptId)) {
        connecting.value = false
      }
      throw error
    } finally {
      if (isCurrentConnectionAttempt(connectionAttemptId)) {
        connecting.value = false
      }
    }
  }

  function reset() {
    activeConnectionAttempt = 0
    channelId.value = null
    channelName.value = null
    participants.value = {}
    muted.value = false
    manualMuted.value = false
    deafened.value = false
    connecting.value = false
    connected.value = false
    activeSpeakers.value = []
    showSettings.value = false
    settingsTab.value = 'audio'
    micModeState.value = 'live'
    transmitting.value = false
    screenSharesByChannel.value = {}
    cameraTracksByChannel.value = {}
    screenShareError.value = null
    cameraError.value = null
    backgroundBlurError.value = null
    cameraEnabled.value = false
    backgroundBlurApplied.value = false
    activeCameraDeviceId.value = null
    meetingVideoEnabled.value = false
    allRemoteCameraSubscriptionsEnabled.value = true
    disabledRemoteCameraParticipantIds.value = {}
    pinnedShareParticipantId.value = null
    screenSharePublishQuality.value = loadScreenSharePublishQuality()
    screenShareViewQuality.value = loadScreenShareViewQuality()
  }

  function upsertScreenShare(targetChannelId, payload) {
    if (!targetChannelId) return
    const entry = normalizeScreenSharePayload(payload)
    if (!entry.participantId) return

    const existing = screenSharesByChannel.value[targetChannelId] || []
    const next = [
      entry,
      ...existing.filter((candidate) => candidate.participantId !== entry.participantId)
    ]

    screenSharesByChannel.value = {
      ...screenSharesByChannel.value,
      [targetChannelId]: next.slice(0, 1)
    }
  }

  function upsertCameraTrack(targetChannelId, payload) {
    if (!targetChannelId) return
    const entry = normalizeCameraPayload(payload)
    if (!entry.participantId) return

    const existing = cameraTracksByChannel.value[targetChannelId] || []
    const previous = existing.find((candidate) => candidate.participantId === entry.participantId) || null
    const next = [
      {
        ...previous,
        ...entry,
        participantName: entry.participantName || previous?.participantName || null,
        publication: entry.publication || previous?.publication || null,
        track: entry.track || previous?.track || null
      },
      ...existing.filter((candidate) => candidate.participantId !== entry.participantId)
    ]

    cameraTracksByChannel.value = {
      ...cameraTracksByChannel.value,
      [targetChannelId]: next
    }
  }

  function removeScreenShare(targetChannelId, participantId) {
    if (!targetChannelId || !participantId) return
    const existing = screenSharesByChannel.value[targetChannelId] || []
    const next = existing.filter((entry) => entry.participantId !== participantId)
    screenSharesByChannel.value = {
      ...screenSharesByChannel.value,
      [targetChannelId]: next
    }
    if (pinnedShareParticipantId.value === participantId) {
      pinnedShareParticipantId.value = null
    }
  }

  function clearCameraTrack(targetChannelId, participantId) {
    if (!targetChannelId || !participantId) return
    const existing = cameraTracksByChannel.value[targetChannelId] || []
    const next = existing.map((entry) => (
      entry.participantId === participantId
        ? { ...entry, track: null }
        : entry
    ))
    cameraTracksByChannel.value = {
      ...cameraTracksByChannel.value,
      [targetChannelId]: next
    }
  }

  function removeCameraTrack(targetChannelId, participantId) {
    if (!targetChannelId || !participantId) return
    const existing = cameraTracksByChannel.value[targetChannelId] || []
    cameraTracksByChannel.value = {
      ...cameraTracksByChannel.value,
      [targetChannelId]: existing.filter((entry) => entry.participantId !== participantId)
    }
  }

  function clearScreenShares(targetChannelId) {
    if (!targetChannelId) return
    screenSharesByChannel.value = {
      ...screenSharesByChannel.value,
      [targetChannelId]: []
    }
  }

  function clearCameraTracks(targetChannelId) {
    if (!targetChannelId) return
    cameraTracksByChannel.value = {
      ...cameraTracksByChannel.value,
      [targetChannelId]: []
    }
  }

  function clearChannelState(targetChannelId) {
    if (!targetChannelId) return

    participants.value = {
      ...participants.value,
      [targetChannelId]: []
    }
    clearScreenShares(targetChannelId)
    clearCameraTracks(targetChannelId)
    if (channelId.value === targetChannelId) {
      pinnedShareParticipantId.value = null
      screenShareError.value = null
      cameraError.value = null
      backgroundBlurError.value = null
      cameraEnabled.value = false
      backgroundBlurApplied.value = false
      activeCameraDeviceId.value = null
      allRemoteCameraSubscriptionsEnabled.value = true
      disabledRemoteCameraParticipantIds.value = {}
    }
  }

  function isRemoteCameraSubscriptionEnabled(participantId) {
    if (!participantId || participantId === useSessionStore().user?.id) return true
    return allRemoteCameraSubscriptionsEnabled.value && disabledRemoteCameraParticipantIds.value[participantId] !== true
  }

  function applyRemoteCameraSubscriptionPreference(participantId) {
    if (!participantId || participantId === useSessionStore().user?.id) return false
    return applyRemoteCameraSubscriptionToRoom(participantId, isRemoteCameraSubscriptionEnabled(participantId))
  }

  function applyAllRemoteCameraSubscriptionPreferences() {
    if (!channelId.value) return
    const entries = cameraTracksByChannel.value[channelId.value] || []
    for (const entry of entries) {
      applyRemoteCameraSubscriptionPreference(entry.participantId)
    }
  }

  async function refreshParticipants() {
    try {
      const { data } = await api.get('/voice')
      const grouped = {}
      for (const participant of asList(data)) {
        if (!grouped[participant.channel_id]) grouped[participant.channel_id] = []
        grouped[participant.channel_id].push(participant)
      }
      participants.value = grouped
      primeVoiceUsers(asList(data))
    } catch (error) {
      console.error('Failed to load voice participants:', error)
    }
  }

  async function resolvePreferredCameraDeviceForStart() {
    const preferredDeviceId = preferredCameraDeviceId.value
    if (!preferredDeviceId) return null

    try {
      const devices = await getVideoInputDevices()
      return devices.some((device) => device?.deviceId === preferredDeviceId)
        ? preferredDeviceId
        : null
    } catch {
      return preferredDeviceId
    }
  }

  async function join(channelIdToJoin) {
    if (!channelIdToJoin || connecting.value) return
    if (channelId.value === channelIdToJoin && connected.value) return

    if (channelId.value && channelId.value !== channelIdToJoin) {
      await leave()
    }

    let joinedBackend = false
    try {
      setupVoiceCallbacks()

      const { data } = await api.post('/voice', { channel_id: channelIdToJoin })
      joinedBackend = true
      await connectWithPayload(data, {
        channelId: channelIdToJoin,
        playJoinSfx: true,
        requestMicrophonePermission: true
      })
    } catch (error) {
      console.error('Failed to join voice channel:', error)
      playSfx(SFX_EVENTS.ERROR_VOICE_CALL)

      if (joinedBackend) {
        try {
          await api.delete(`/voice/${channelIdToJoin}`)
        } catch {
          // ignore
        }
      }

      channelId.value = null
      channelName.value = null
      connected.value = false

      const detail = getApiErrorMessage(error) || error.message
      window.$message?.error(t('ui.stores.voice_join_failed', { detail: detail }))
      throw error
    }
  }

  async function leave(options = {}) {
    const {
      playLeaveSfx = true,
      notifyErrors = true,
      skipBackendLeave = false
    } = options

    const currentChannelId = channelId.value
    if (!currentChannelId) return

    cancelPendingConnection()
    await stopScreenShare({ notifyErrors: false })
    try {
      await stopCamera({ notifyErrors: false })
    } catch {
      // Leaving the room should continue even if camera state was already cleaned up remotely.
    }
    micActivation.destroy()
    let hadVoiceError = false
    const playVoiceErrorOnce = () => {
      if (hadVoiceError || !notifyErrors) return
      hadVoiceError = true
      playSfx(SFX_EVENTS.ERROR_VOICE_CALL)
    }

    try {
      await disconnectFromRoom()
    } catch (error) {
      if (notifyErrors) {
        console.error('Failed to disconnect from room:', error)
      }
      playVoiceErrorOnce()
    }

    if (!skipBackendLeave) {
      try {
        await api.delete(`/voice/${currentChannelId}`)
      } catch (error) {
        if (notifyErrors) {
          console.error('Failed to leave voice channel:', error)
        }
        playVoiceErrorOnce()
      }
    }

    const sessionStore = useSessionStore()
    if (participants.value[currentChannelId] && sessionStore.user) {
      participants.value = {
        ...participants.value,
        [currentChannelId]: participants.value[currentChannelId].filter(
          (participant) => participant.user_id !== sessionStore.user.id
        )
      }
    }

    channelId.value = null
    channelName.value = null
    muted.value = false
    deafened.value = false
    connecting.value = false
    connected.value = false
    activeSpeakers.value = []
    settingsTab.value = 'audio'
    micModeState.value = 'live'
    manualMuted.value = false
    transmitting.value = false
    clearScreenShares(currentChannelId)
    clearCameraTracks(currentChannelId)
    cameraEnabled.value = false
    backgroundBlurApplied.value = false
    activeCameraDeviceId.value = null
    meetingVideoEnabled.value = false
    allRemoteCameraSubscriptionsEnabled.value = true
    disabledRemoteCameraParticipantIds.value = {}
    pinnedShareParticipantId.value = null
    screenShareError.value = null
    cameraError.value = null
    backgroundBlurError.value = null
    if (playLeaveSfx) {
      playSfx(SFX_EVENTS.VOICE_LEAVE_SELF)
    }
  }

  async function reconnectIfNeeded() {
    const sessionStore = useSessionStore()
    if (!sessionStore.user) return

    let participantChannelId = null
    for (const [candidateChannelId, voiceParticipants] of Object.entries(participants.value)) {
      if (voiceParticipants.find((participant) => participant.user_id === sessionStore.user.id)) {
        participantChannelId = candidateChannelId
        break
      }
    }

    const fallbackChannelId = channelId.value && !connected.value
      ? channelId.value
      : null
    const myChannelId = participantChannelId || fallbackChannelId
    if (!myChannelId) return

    const channelsStore = useChannelsStore()
    const channel = channelsStore.channels.find((entry) => entry.id === myChannelId)
    if (channelId.value === myChannelId && (connected.value || connecting.value)) {
      return
    }

    try {
      setupVoiceCallbacks()

      const { data } = await api.post('/voice', { channel_id: myChannelId })
      await connectWithPayload({
        ...data,
        channelName: resolveVoiceChannelName(channel)
      }, {
        channelId: myChannelId,
        playJoinSfx: false
      })
    } catch (error) {
      console.error('Failed to reconnect to voice channel:', error)
      playSfx(SFX_EVENTS.ERROR_VOICE_CALL)
    }
  }

  async function toggleMute() {
    if (!channelId.value) return
    try {
      const nextMuted = !manualMuted.value
      muted.value = nextMuted
      manualMuted.value = nextMuted

      micActivation.setManualMute(nextMuted)

      updateSelfParticipantState(channelId.value, { is_muted: nextMuted })
      await api.patch(`/voice/${channelId.value}`, { is_muted: nextMuted })
    } catch (error) {
      console.error('Failed to toggle mute:', error)
    }
  }

  function setMicMode(mode) {
    micModeState.value = mode
    micActivation.setMode(mode)
    micActivation.saveSettings()
  }

  function isParticipantSpeaking(userId) {
    if (!userId) return false

    const selfUserId = useSessionStore().user?.id || null
    if (userId === selfUserId) {
      if (micModeState.value === 'live' || micModeState.value === 'ptt') {
        return transmitting.value
      }
    }

    return activeSpeakers.value.includes(userId)
  }

  async function toggleDeafen() {
    if (!channelId.value) return
    deafened.value = !deafened.value
    setDeafened(deafened.value)
    updateSelfParticipantState(channelId.value, { is_deafened: deafened.value })
    try {
      await api.patch(`/voice/${channelId.value}`, { is_deafened: deafened.value })
    } catch (error) {
      console.error('Failed to toggle deafen:', error)
    }
  }

  function updateSelfParticipantState(targetChannelId, updates) {
    const sessionStore = useSessionStore()
    if (!sessionStore.user || !participants.value[targetChannelId]) return
    participants.value = {
      ...participants.value,
      [targetChannelId]: participants.value[targetChannelId].map((participant) =>
        participant.user_id === sessionStore.user.id ? { ...participant, ...updates } : participant
      )
    }
  }

  function addParticipant(targetChannelId, participant) {
    primeVoiceUsers([participant])
    const current = participants.value[targetChannelId] || []
    if (!current.find((entry) => entry.user_id === participant.user_id)) {
      participants.value = {
        ...participants.value,
        [targetChannelId]: [...current, participant]
      }
    }
  }

  function removeParticipant(targetChannelId, userId) {
    if (!participants.value[targetChannelId]) return
    participants.value = {
      ...participants.value,
      [targetChannelId]: participants.value[targetChannelId].filter((entry) => entry.user_id !== userId)
    }
  }

  function updateParticipant(targetChannelId, userId, state) {
    if (!participants.value[targetChannelId]) return
    participants.value = {
      ...participants.value,
      [targetChannelId]: participants.value[targetChannelId].map((entry) =>
        entry.user_id === userId ? { ...entry, ...state } : entry
      )
    }
    primeVoiceUsers(participants.value[targetChannelId])
  }

  function markDisconnected() {
    cancelPendingConnection()
    connected.value = false
    activeSpeakers.value = []
    clearScreenShares(channelId.value)
    clearCameraTracks(channelId.value)
    cameraEnabled.value = false
    backgroundBlurApplied.value = false
    activeCameraDeviceId.value = null
    allRemoteCameraSubscriptionsEnabled.value = true
    disabledRemoteCameraParticipantIds.value = {}
    pinnedShareParticipantId.value = null
    screenShareError.value = null
    cameraError.value = null
    backgroundBlurError.value = null
  }

  async function setPreferredCameraDevice(deviceId) {
    if (!connected.value) {
      return activeCameraDeviceId.value
    }

    if (deviceId) {
      await applyVideoInputDeviceToRoom(deviceId)
    }
    activeCameraDeviceId.value = getActiveVideoInputDevice() || activeCameraDeviceId.value || null
    return activeCameraDeviceId.value
  }

  async function setBackgroundBlurEnabled(enabled) {
    backgroundBlurError.value = null

    if (enabled && !backgroundBlurSupported.value) {
      const error = new Error(t('ui.components.background_blur_unsupported_body'))
      error.code = 'MEETING_BACKGROUND_BLUR_UNSUPPORTED'
      backgroundBlurError.value = error.message
      throw error
    }

    if (!cameraEnabled.value || !connected.value) {
      backgroundBlurApplied.value = false
      return false
    }

    try {
      await applyBackgroundBlurToRoom(enabled)
      backgroundBlurApplied.value = enabled ? hasBackgroundBlurEnabled() : false
      backgroundImageApplied.value = false
      return backgroundBlurApplied.value
    } catch (error) {
      backgroundBlurApplied.value = hasBackgroundBlurEnabled()
      backgroundBlurError.value = getApiErrorMessage(error) || error.message || t('ui.components.background_blur_update_failed')
      throw error
    }
  }

  async function resolvePreferredBackgroundImageUrl() {
    if (!backgroundImageEnabledPreference.value || !backgroundImagePreferenceId.value) return null
    const videoBackgroundsStore = useVideoBackgroundsStore()
    let background = videoBackgroundsStore.backgrounds.find((entry) => entry.id === backgroundImagePreferenceId.value)
    if (!background) {
      await videoBackgroundsStore.loadBackgrounds()
      background = videoBackgroundsStore.backgrounds.find((entry) => entry.id === backgroundImagePreferenceId.value)
    }
    if (!background) return null
    return videoBackgroundsStore.ensureObjectUrl(background)
  }

  async function setVirtualBackgroundImage(imageUrl) {
    backgroundBlurError.value = null
    if (!cameraEnabled.value || !connected.value) {
      backgroundImageApplied.value = false
      return false
    }

    try {
      const applied = await applyVirtualBackgroundImageToRoom(imageUrl || null)
      backgroundImageApplied.value = applied && !!imageUrl
      if (backgroundImageApplied.value) {
        backgroundBlurApplied.value = false
      }
      return backgroundImageApplied.value
    } catch (error) {
      backgroundImageApplied.value = false
      backgroundBlurError.value = getApiErrorMessage(error) || error.message || t('ui.views.video_background_save_failed')
      throw error
    }
  }

  async function startCamera(options = {}) {
    const { allowUnsupportedBlurFallback = false } = options
    if (!channelId.value || !connected.value) {
      const error = new Error('Voice connection required for video')
      cameraError.value = error.message
      throw error
    }

    if (!meetingVideoEnabled.value) {
      const error = new Error(t('ui.views.meeting_video_disabled'))
      cameraError.value = error.message
      throw error
    }

    cameraError.value = null
    backgroundBlurError.value = null
    const selfId = useSessionStore().user?.id || null
    const shouldApplyBackgroundBlur = backgroundBlurEnabledPreference.value
    const virtualBackgroundImageUrl = await resolvePreferredBackgroundImageUrl()

    if ((shouldApplyBackgroundBlur || virtualBackgroundImageUrl) && !backgroundBlurSupported.value && !allowUnsupportedBlurFallback) {
      const error = new Error(t('ui.components.background_blur_unsupported_body'))
      error.code = 'MEETING_BACKGROUND_BLUR_CONFIRMATION_REQUIRED'
      backgroundBlurError.value = error.message
      throw error
    }

    try {
      const resolvedDeviceId = await resolvePreferredCameraDeviceForStart()
      const result = await publishCamera({
        deviceId: resolvedDeviceId,
        backgroundBlurEnabled: !virtualBackgroundImageUrl && shouldApplyBackgroundBlur && backgroundBlurSupported.value,
        virtualBackgroundImageUrl
      })
      upsertCameraTrack(channelId.value, {
        participantId: selfId,
        participantName: useSessionStore().user?.display_name || null,
        track: result.track,
        publication: result.publication,
        isLocal: true
      })
      cameraEnabled.value = true
      backgroundBlurApplied.value = result.backgroundBlurEnabled === true
      backgroundImageApplied.value = !!result.virtualBackgroundImageUrl
      activeCameraDeviceId.value = result.deviceId || getActiveVideoInputDevice() || resolvedDeviceId || null
      updateSelfParticipantState(channelId.value, { is_video_enabled: true })
      await api.patch(`/voice/${channelId.value}`, { is_video_enabled: true })
      return result
    } catch (error) {
      cameraEnabled.value = false
      backgroundBlurApplied.value = false
      backgroundImageApplied.value = false
      activeCameraDeviceId.value = null
      cameraError.value = getApiErrorMessage(error) || error.message || t('ui.components.camera_start_failed')
      throw error
    }
  }

  async function stopCamera(options = {}) {
    const { notifyErrors = true } = options
    if (!channelId.value) return
    const selfId = useSessionStore().user?.id || null

    try {
      await unpublishCamera({ suppressErrors: !notifyErrors })
      removeCameraTrack(channelId.value, selfId)
      cameraEnabled.value = false
      backgroundBlurApplied.value = false
      activeCameraDeviceId.value = null
      updateSelfParticipantState(channelId.value, { is_video_enabled: false })
      await api.patch(`/voice/${channelId.value}`, { is_video_enabled: false })
      cameraError.value = null
      backgroundBlurError.value = null
    } catch (error) {
      if (notifyErrors) {
        cameraError.value = getApiErrorMessage(error) || error.message || t('ui.components.camera_stop_failed')
      }
      throw error
    }
  }

  async function toggleCamera(options = {}) {
    if (cameraEnabled.value) {
      await stopCamera()
      return false
    }
    await startCamera(options)
    return true
  }

  async function startScreenShare(options = {}) {
    if (!channelId.value || !connected.value) {
      const error = new Error('Voice connection required for screen sharing')
      screenShareError.value = error.message
      throw error
    }

    const current = currentScreenShares.value
    const selfId = useSessionStore().user?.id || null
    const existingShare = current[0] || null
    if (existingShare && existingShare.participantId && existingShare.participantId !== selfId) {
      const error = new Error(t('ui.components.screen_share_already_active'))
      screenShareError.value = error.message
      throw error
    }

    screenShareError.value = null

    try {
      const qualityProfile = normalizeScreenSharePublishQuality(options.qualityProfile || screenSharePublishQuality.value)
      const result = await publishScreenShare({
        ...options,
        qualityProfile
      })
      upsertScreenShare(channelId.value, {
        participantId: selfId,
        participantName: useSessionStore().user?.display_name || null,
        track: result.track,
        isLocal: true,
        hasAudio: !!result.hasAudio,
        qualityProfile: result.qualityProfile || qualityProfile
      })
      return result
    } catch (error) {
      screenShareError.value = getApiErrorMessage(error) || error.message || t('ui.components.screen_share_start_failed')
      throw error
    }
  }

  async function stopScreenShare(options = {}) {
    const { notifyErrors = true } = options
    if (!channelId.value) return
    const selfId = useSessionStore().user?.id || null

    try {
      await unpublishScreenShare({ suppressErrors: !notifyErrors })
      removeScreenShare(channelId.value, selfId)
      screenShareError.value = null
    } catch (error) {
      if (notifyErrors) {
        screenShareError.value = getApiErrorMessage(error) || error.message || t('ui.components.screen_share_stop_failed')
      }
      throw error
    }
  }

  function pinScreenShare(participantId) {
    pinnedShareParticipantId.value = participantId || null
  }

  function clearPinnedScreenShare() {
    pinnedShareParticipantId.value = null
  }

  function setAllRemoteCameraSubscriptions(enabled) {
    allRemoteCameraSubscriptionsEnabled.value = !!enabled
    applyAllRemoteCameraSubscriptionPreferences()
  }

  function setRemoteCameraSubscription(participantId, enabled) {
    if (!participantId || participantId === useSessionStore().user?.id) return

    if (enabled) {
      const next = { ...disabledRemoteCameraParticipantIds.value }
      delete next[participantId]
      disabledRemoteCameraParticipantIds.value = next
    } else {
      disabledRemoteCameraParticipantIds.value = {
        ...disabledRemoteCameraParticipantIds.value,
        [participantId]: true
      }
    }

    applyRemoteCameraSubscriptionPreference(participantId)
  }

  function setScreenSharePublishQuality(value) {
    const normalized = normalizeScreenSharePublishQuality(value)
    screenSharePublishQuality.value = normalized
    persistScreenSharePublishQuality(normalized)
  }

  function setScreenShareViewQuality(value) {
    const normalized = normalizeScreenShareViewQuality(value)
    screenShareViewQuality.value = normalized
    persistScreenShareViewQuality(normalized)
  }

  function applyScreenShareViewQuality(share = activeScreenShare.value, videoElement = null) {
    if (!share || share.isLocal || !share.publication) return
    applyLivekitScreenShareViewQuality(share.publication, screenShareViewQuality.value, videoElement)
  }

  return {
    channelId,
    channelName,
    participants,
    muted,
    manualMuted,
    deafened,
    connected,
    connecting,
    activeSpeakers,
    showSettings,
    settingsTab,
    micMode,
    transmitting,
    screenSharesByChannel,
    cameraTracksByChannel,
    currentScreenShares,
    currentCameraTracks,
    activeScreenShare,
    isSharingScreen,
    screenShareError,
    cameraError,
    backgroundBlurError,
    cameraEnabled,
    backgroundBlurApplied,
    backgroundImageApplied,
    activeCameraDeviceId,
    meetingVideoEnabled,
    meetingVideoPreferences,
    preferredCameraDeviceId,
    backgroundBlurEnabledPreference,
    backgroundImageEnabledPreference,
    backgroundImagePreferenceId,
    backgroundBlurSupported,
    modernBackgroundBlurSupported,
    allRemoteCameraSubscriptionsEnabled,
    disabledRemoteCameraParticipantIds,
    pinnedShareParticipantId,
    screenSharePublishQuality,
    screenShareViewQuality,
    reset,
    refreshParticipants,
    join,
    leave,
    reconnectIfNeeded,
    toggleMute,
    toggleDeafen,
    setMicMode,
    isParticipantSpeaking,
    connectWithPayload,
    addParticipant,
    removeParticipant,
    updateParticipant,
    clearChannelState,
    markDisconnected,
    startScreenShare,
    stopScreenShare,
    setPreferredCameraDevice,
    setBackgroundBlurEnabled,
    setVirtualBackgroundImage,
    startCamera,
    stopCamera,
    toggleCamera,
    setAllRemoteCameraSubscriptions,
    setRemoteCameraSubscription,
    isRemoteCameraSubscriptionEnabled,
    pinScreenShare,
    clearPinnedScreenShare,
    setScreenSharePublishQuality,
    setScreenShareViewQuality,
    applyScreenShareViewQuality
  }
})
