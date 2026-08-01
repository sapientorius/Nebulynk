import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import { t } from '../lib/i18n.js'
import { getApiErrorMessage } from '../lib/api-error.js'
import {
  resolveIncomingCallSourceDisplayName,
  resolveMeetingDisplayTitle,
  resolveMeetingSourceDisplayName
} from '../lib/meeting-display.js'
import { useChannelsStore } from './channels.js'
import { useVoiceStore } from './voice.js'
import { useDmsStore } from './dms.js'
import { useSessionStore } from './session.js'
import { useNotificationsStore } from './notifications.js'

const RING_DURATION_MS = 30_000
const RING_INTERVAL_MS = 4_000
const RECOVERY_REFRESH_DEBOUNCE_MS = 500

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function hasMeetingDetails(meeting) {
  if (!meeting || typeof meeting !== 'object') return false
  if (meeting.detail_level === 'full') return true
  return Array.isArray(meeting.participants) || Array.isArray(meeting.artifacts)
}

function normalizeMeetingDetailRequest(value) {
  return value === 'full' ? 'full' : 'summary'
}

function meetingSatisfiesDetail(meeting, detail = 'summary') {
  if (!meeting || typeof meeting !== 'object') return false
  if (detail !== 'full') return true
  return hasMeetingDetails(meeting)
}

function mergeMeetingRecords(existing, incoming) {
  if (!existing) return incoming
  if (!incoming) return existing

  const incomingHasDetails = hasMeetingDetails(incoming)
  const existingHasDetails = hasMeetingDetails(existing)

  const merged = {
    ...existing,
    ...incoming,
    source_channel: {
      ...(existing.source_channel || {}),
      ...(incoming.source_channel || {})
    },
    chat_channel: {
      ...(existing.chat_channel || {}),
      ...(incoming.chat_channel || {})
    }
  }

  if (!incomingHasDetails && existingHasDetails) {
    if (Array.isArray(existing.participants)) {
      merged.participants = existing.participants
    }
    if (Array.isArray(existing.artifacts)) {
      merged.artifacts = existing.artifacts
    }
    merged.detail_level = existing.detail_level || 'full'
  } else if (incomingHasDetails) {
    merged.detail_level = incoming.detail_level || 'full'
  } else {
    merged.detail_level = incoming.detail_level || existing.detail_level || 'summary'
  }

  return merged
}

function pickMeetingByChatChannelId(list, chatChannelId) {
  if (!chatChannelId) return null
  const active = list.find((meeting) => (
    meeting.chat_channel_id === chatChannelId && meeting.status === 'active'
  ))
  if (active) return active
  return list.find((meeting) => meeting.chat_channel_id === chatChannelId) || null
}

function buildIncomingCallToast(call, meeting) {
  const title = t('ui.components.incoming_call')
  const content = meeting
    ? resolveMeetingDisplayTitle(meeting, { tFn: t })
    : resolveIncomingCallSourceDisplayName(call, { tFn: t })
  const source = meeting
    ? resolveMeetingSourceDisplayName(meeting, { tFn: t })
    : resolveIncomingCallSourceDisplayName(call, { tFn: t })

  const normalizedContent = typeof content === 'string' ? content.trim() : ''
  const normalizedSource = typeof source === 'string' ? source.trim() : ''

  return {
    title,
    content: normalizedContent || title,
    meta: normalizedSource && normalizedSource !== normalizedContent ? normalizedSource : undefined,
    duration: 6000
  }
}

const callTimeouts = new Map()
let ringLoopId = null

export const useMeetingsStore = defineStore('meetings', () => {
  const meetings = ref([])
  const activeMeetingId = ref(null)
  const activeMeeting = ref(null)
  const incomingCalls = ref([])
  const questionsByMeetingId = ref({})
  const pendingMeetingLoads = new Map()
  let recoveryRefreshTimeoutId = null
  const activeSourceChannelIds = computed(() => {
    const ids = meetings.value
      .filter((meeting) => (
        meeting?.status === 'active'
        && typeof meeting?.source_channel_id === 'string'
        && meeting.source_channel_id.length > 0
      ))
      .map((meeting) => meeting.source_channel_id)

    return new Set(ids)
  })

  function clearRingLoop() {
    if (!ringLoopId) return
    clearInterval(ringLoopId)
    ringLoopId = null
  }

  function clearRecoveryRefresh() {
    if (!recoveryRefreshTimeoutId) return
    clearTimeout(recoveryRefreshTimeoutId)
    recoveryRefreshTimeoutId = null
  }

  function ensureRingLoop() {
    if (ringLoopId || incomingCalls.value.length === 0) return

    playSfx(SFX_EVENTS.CALL_INCOMING)
    ringLoopId = setInterval(() => {
      if (incomingCalls.value.length === 0) {
        clearRingLoop()
        return
      }
      playSfx(SFX_EVENTS.CALL_INCOMING)
    }, RING_INTERVAL_MS)
  }

  function clearCallTimeout(meetingId) {
    const timeoutId = callTimeouts.get(meetingId)
    if (!timeoutId) return
    clearTimeout(timeoutId)
    callTimeouts.delete(meetingId)
  }

  function clearIncomingCall(meetingId) {
    clearCallTimeout(meetingId)
    incomingCalls.value = incomingCalls.value.filter((entry) => entry.meeting_id !== meetingId)
    if (incomingCalls.value.length === 0) {
      clearRingLoop()
    }
  }

  function scheduleIncomingCallTimeout(meetingId) {
    clearCallTimeout(meetingId)
    const timeoutId = setTimeout(() => {
      declineIncomingCall(meetingId, { silent: true }).catch(() => {})
    }, RING_DURATION_MS)
    callTimeouts.set(meetingId, timeoutId)
  }

  function upsertIncomingCall(call) {
    const index = incomingCalls.value.findIndex((entry) => entry.meeting_id === call.meeting_id)
    if (index === -1) {
      incomingCalls.value.push(call)
    } else {
      incomingCalls.value[index] = { ...incomingCalls.value[index], ...call }
    }

    incomingCalls.value.sort((a, b) => a.received_at - b.received_at)
    scheduleIncomingCallTimeout(call.meeting_id)
    ensureRingLoop()
  }

  function reset() {
    meetings.value = []
    clearActive()
    for (const timeoutId of callTimeouts.values()) {
      clearTimeout(timeoutId)
    }
    callTimeouts.clear()
    clearRingLoop()
    clearRecoveryRefresh()
    incomingCalls.value = []
    questionsByMeetingId.value = {}
    pendingMeetingLoads.clear()
  }

  function hasMeetingChatChannel(channelId) {
    return meetings.value.some((meeting) => meeting.chat_channel_id === channelId)
  }

  function clearActive() {
    activeMeetingId.value = null
    activeMeeting.value = null
  }

  function hasActiveMeetingForSourceChannel(channelId) {
    if (typeof channelId !== 'string' || channelId.length === 0) return false
    return activeSourceChannelIds.value.has(channelId)
  }

  async function findMeetingByChatChannelId(chatChannelId, options = {}) {
    const {
      refreshIfMissing = true,
      includeEnded = true
    } = options

    if (!chatChannelId) return null

    let meeting = pickMeetingByChatChannelId(meetings.value, chatChannelId)
    if (meeting || !refreshIfMissing) {
      return meeting
    }

    await refresh(includeEnded)
    meeting = pickMeetingByChatChannelId(meetings.value, chatChannelId)
    return meeting
  }

  function upsertMeeting(meeting) {
    if (!meeting?.id) return
    const index = meetings.value.findIndex((entry) => entry.id === meeting.id)
    const existing = index === -1 ? null : meetings.value[index]
    const nextMeeting = mergeMeetingRecords(existing, meeting)
    if (index === -1) {
      meetings.value.unshift(nextMeeting)
    } else {
      meetings.value[index] = nextMeeting
    }

    if (activeMeetingId.value === meeting.id) {
      activeMeeting.value = mergeMeetingRecords(activeMeeting.value, nextMeeting)
    }

    ensureMeetingChannel(nextMeeting)
  }

  function scheduleRecoveryRefresh(includeEnded = true) {
    if (recoveryRefreshTimeoutId) return

    recoveryRefreshTimeoutId = setTimeout(() => {
      recoveryRefreshTimeoutId = null
      refresh(includeEnded).catch(() => {})
    }, RECOVERY_REFRESH_DEBOUNCE_MS)
  }

  function mergeMeetingRealtimePatch(meetingId, patch = {}) {
    if (!meetingId) return null

    const existing = getMeetingById(meetingId)
    if (!existing) return null

    const nextMeeting = {
      ...existing,
      ...patch
    }

    if (patch.chat_channel) {
      nextMeeting.chat_channel = {
        ...(existing.chat_channel || {}),
        ...patch.chat_channel
      }
    }

    upsertMeeting(nextMeeting)
    return nextMeeting
  }

  function removeOrArchiveMeetingLocally(meetingId, eventPayload = {}) {
    return mergeMeetingRealtimePatch(meetingId, {
      status: eventPayload.status || 'ended',
      ended_at: eventPayload.endedAt || null,
      ended_by: eventPayload.endedBy || null,
      chat_channel: {
        ...(eventPayload.chatChannelId ? { id: eventPayload.chatChannelId } : {}),
        ...(eventPayload.chatChannelArchived !== undefined
          ? { is_archived: !!eventPayload.chatChannelArchived }
          : {})
      }
    })
  }

  function shouldHydrateMeetingFromRealtime(meeting) {
    if (!meeting?.id) return false
    return !meeting.source_channel || !meeting.chat_channel
  }

  function ensureMeetingChannel(meeting) {
    if (!meeting?.chat_channel_id) return

    const displayName = resolveMeetingDisplayTitle(meeting, { tFn: t })
    const channelsStore = useChannelsStore()
    const channel = {
      id: meeting.chat_channel_id,
      name: meeting.chat_channel?.name || `meeting-${meeting.id}`,
      type: 'private',
      purpose: 'meeting',
      is_voice: true,
      is_archived: !!meeting.chat_channel?.is_archived,
      topic: displayName || null
    }

    if (!channelsStore.hasChannel(channel.id)) {
      channelsStore.addChannel(channel)
      return
    }

    channelsStore.patchChannel(channel)
  }

  async function refresh(includeEnded = false, extraParams = {}) {
    try {
      const { data } = await api.get('/meetings', {
        params: includeEnded
          ? { include_ended: true, $limit: 100, ...extraParams }
          : { $limit: 100, ...extraParams }
      })
      const previousById = new Map(meetings.value.map((meeting) => [meeting.id, meeting]))
      meetings.value = asList(data).map((meeting) => mergeMeetingRecords(previousById.get(meeting.id), meeting))
      for (const meeting of meetings.value) {
        ensureMeetingChannel(meeting)
      }

      if (activeMeetingId.value) {
        const nextActive = meetings.value.find((entry) => entry.id === activeMeetingId.value) || null
        if (nextActive) {
          activeMeeting.value = nextActive
        }
      }
    } catch (error) {
      console.error('Failed to load meetings:', error)
    }
  }

  async function loadOverviewBuckets(options = {}) {
    const requestedPastVisibleCount = Number(options.pastVisibleCount)
    const pastVisibleCount = Number.isFinite(requestedPastVisibleCount)
      ? Math.min(Math.max(Math.trunc(requestedPastVisibleCount), 1), 99)
      : 8
    const pastProbeLimit = Math.min(pastVisibleCount + 1, 100)
    const [
      upcomingResponse,
      liveResponse,
      pastResponse
    ] = await Promise.all([
      api.get('/meetings', {
        params: {
          time_bucket: 'upcoming',
          detail: 'summary',
          $limit: 100
        }
      }),
      api.get('/meetings', {
        params: {
          time_bucket: 'live',
          detail: 'summary',
          $limit: 100
        }
      }),
      api.get('/meetings', {
        params: {
          time_bucket: 'past',
          include_ended: true,
          detail: 'full',
          $limit: pastProbeLimit
        }
      })
    ])

    const upcoming = asList(upcomingResponse.data)
    const live = asList(liveResponse.data)
    const pastWithProbe = asList(pastResponse.data)
    const pastHasMore = pastWithProbe.length > pastVisibleCount
    const past = pastHasMore
      ? pastWithProbe.slice(0, pastVisibleCount)
      : pastWithProbe

    for (const meeting of [...upcoming, ...live, ...past]) {
      upsertMeeting(meeting)
    }

    return {
      upcoming,
      live,
      past,
      pastHasMore
    }
  }

  async function get(meetingId) {
    const { data } = await api.get(`/meetings/${meetingId}`)
    upsertMeeting(data)
    return data
  }

  function getMeetingById(meetingId) {
    if (!meetingId) return null
    if (activeMeeting.value?.id === meetingId) {
      return activeMeeting.value
    }
    return meetings.value.find((entry) => entry.id === meetingId) || null
  }

  async function ensureMeetingLoaded(meetingId, options = {}) {
    const {
      force = false,
      detail = 'summary'
    } = options
    const requestedDetail = normalizeMeetingDetailRequest(detail)
    if (!meetingId) return null

    const existing = getMeetingById(meetingId)
    if (existing && !force && meetingSatisfiesDetail(existing, requestedDetail)) {
      return existing
    }

    const pending = pendingMeetingLoads.get(meetingId)
    if (pending) {
      return pending
    }

    const request = get(meetingId)
      .finally(() => {
        pendingMeetingLoads.delete(meetingId)
      })

    pendingMeetingLoads.set(meetingId, request)
    return request
  }

  async function fetchActiveBySourceChannel(sourceChannelId) {
    if (!sourceChannelId) return null
    const { data } = await api.get('/meetings', {
      params: {
        source_channel_id: sourceChannelId,
        status: 'active',
        $limit: 1
      }
    })

    const list = asList(data)
    const meeting = list.find((entry) => entry.status === 'active') || null
    if (meeting) {
      upsertMeeting(meeting)
    }
    return meeting
  }

  async function fetchBySourceChannel(sourceChannelId, options = {}) {
    if (!sourceChannelId) return []
    const {
      includeEnded = true,
      detail = 'summary',
      limit = 100,
      timeBucket = null
    } = options
    const detailLevel = detail === 'full' ? 'full' : 'summary'
    const resolvedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100)
    const { data } = await api.get('/meetings', {
      params: {
        source_channel_id: sourceChannelId,
        ...(includeEnded ? { include_ended: true } : {}),
        ...(timeBucket ? { time_bucket: timeBucket } : {}),
        detail: detailLevel,
        $limit: resolvedLimit
      }
    })

    const list = asList(data)
    for (const meeting of list) {
      upsertMeeting(meeting)
    }
    return list
  }

  async function setActive(meetingId) {
    activeMeetingId.value = meetingId

    const meeting = await get(meetingId)
    activeMeeting.value = meeting

    const notificationsStore = useNotificationsStore()
    await notificationsStore.markMeetingInviteRead(meetingId).catch(() => {})

    const channelsStore = useChannelsStore()
    await channelsStore.select(meeting.chat_channel_id)

    return meeting
  }

  async function startFromChannel(sourceChannelId, initialUserIds = [], title = '') {
    const payload = {
      source_channel_id: sourceChannelId
    }
    if (initialUserIds.length > 0) payload.initial_user_ids = initialUserIds
    if (title && title.trim()) payload.title = title.trim()

    const { data } = await api.post('/meetings', payload)
    upsertMeeting(data)
    return data
  }

  async function scheduleFromChannel(sourceChannelId, options = {}) {
    const payload = {
      source_channel_id: sourceChannelId
    }
    if (Array.isArray(options.initialUserIds) && options.initialUserIds.length > 0) {
      payload.initial_user_ids = [...new Set(options.initialUserIds.filter(Boolean))]
    }
    if (options.title && options.title.trim()) payload.title = options.title.trim()
    if (options.description && options.description.trim()) payload.description = options.description.trim()
    if (options.language) payload.language = options.language
    if (options.scheduledStartAt) payload.scheduled_start_at = options.scheduledStartAt
    if (options.scheduledEndAt) payload.scheduled_end_at = options.scheduledEndAt

    const { data } = await api.post('/meetings', payload)
    upsertMeeting(data)
    return data
  }

  async function invite(meetingId, userIds) {
    const unique = [...new Set((userIds || []).filter(Boolean))]
    if (unique.length === 0) return activeMeeting.value

    const { data } = await api.patch(`/meetings/${meetingId}`, {
      action: 'invite',
      user_ids: unique
    })

    upsertMeeting(data)
    return data
  }

  async function join(meetingId, options = {}) {
    const { data } = await api.patch(`/meetings/${meetingId}`, {
      action: 'join',
      ...options
    })
    const meeting = data.meeting
    const voicePayload = data.voice

    upsertMeeting(meeting)
    activeMeetingId.value = meeting.id
    activeMeeting.value = meeting
    clearIncomingCall(meeting.id)

    const channelsStore = useChannelsStore()
    await channelsStore.select(meeting.chat_channel_id)

    const voiceStore = useVoiceStore()
    try {
      await voiceStore.connectWithPayload({
        ...voicePayload,
        channelName: resolveMeetingDisplayTitle(meeting, { tFn: t })
      }, {
        requestMicrophonePermission: true
      })
    } catch (error) {
      console.error('Meeting joined, but voice connection failed:', error)

      const detail = getApiErrorMessage(error) || error?.message || null
      const suffix = detail ? `: ${detail}` : ''
      globalThis.window?.$message?.warning?.(t('ui.stores.joined_meeting_but_voice_connection_failed', { suffix: suffix }))
    }

    return data
  }

  async function end(meetingId, reason = null) {
    const payload = reason ? { action: 'end', reason } : { action: 'end' }
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    clearIncomingCall(meetingId)

    const voiceStore = useVoiceStore()
    if (voiceStore.channelId === data.chat_channel_id) {
      await voiceStore.leave({
        playLeaveSfx: false,
        notifyErrors: false,
        skipBackendLeave: true
      })
    }

    return data
  }

  async function cancel(meetingId, reason = null) {
    const payload = reason ? { action: 'cancel', reason } : { action: 'cancel' }
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    clearIncomingCall(meetingId)
    return data
  }

  async function decline(meetingId) {
    const { data } = await api.patch(`/meetings/${meetingId}`, { action: 'decline' })
    upsertMeeting(data)
    clearIncomingCall(meetingId)
    return data
  }

  async function setTitle(meetingId, title) {
    const payload = {
      action: 'set_title',
      title: typeof title === 'string' && title.trim() ? title.trim() : null
    }
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    return data
  }

  async function reschedule(meetingId, payload = {}) {
    const { data } = await api.patch(`/meetings/${meetingId}`, {
      action: 'reschedule',
      ...payload
    })
    upsertMeeting(data)
    return data
  }

  async function createInviteLink(meetingId, expiresAt = null) {
    const payload = { action: 'create_invite_link' }
    if (expiresAt) payload.expires_at = expiresAt
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    return data
  }

  async function revokeInviteLink(meetingId, linkId = null) {
    const payload = { action: 'revoke_invite_link' }
    if (linkId) payload.link_id = linkId
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    return data
  }

  async function generateSummary(meetingId, options = {}) {
    const payload = { action: 'generate_summary' }
    if (typeof options.reason === 'string' && options.reason.trim()) {
      payload.reason = options.reason.trim()
    }
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    return data
  }

  async function setLanguage(meetingId, language) {
    const { data } = await api.patch(`/meetings/${meetingId}`, {
      action: 'set_language',
      language
    })
    upsertMeeting(data)
    return data
  }

  async function generateTranscript(meetingId, options = {}) {
    const payload = { action: 'generate_transcript' }
    if (typeof options.reason === 'string' && options.reason.trim()) {
      payload.reason = options.reason.trim()
    }
    const { data } = await api.patch(`/meetings/${meetingId}`, payload)
    upsertMeeting(data)
    return data
  }

  async function pauseTranscriptionRecording(meetingId) {
    const { data } = await api.patch(`/meetings/${meetingId}`, { action: 'pause_transcription_recording' })
    upsertMeeting(data)
    return data
  }

  async function resumeTranscriptionRecording(meetingId) {
    const { data } = await api.patch(`/meetings/${meetingId}`, { action: 'resume_transcription_recording' })
    upsertMeeting(data)
    return data
  }

  function getQuestions(meetingId) {
    return questionsByMeetingId.value[meetingId] || []
  }

  async function loadQuestions(meetingId) {
    if (!meetingId) return []
    const { data } = await api.get('/meeting-questions', {
      params: { meeting_id: meetingId }
    })
    questionsByMeetingId.value = {
      ...questionsByMeetingId.value,
      [meetingId]: asList(data)
    }
    return questionsByMeetingId.value[meetingId]
  }

  async function askQuestion(meetingId, question) {
    const { data } = await api.post('/meeting-questions', {
      meeting_id: meetingId,
      question
    })

    const existing = getQuestions(meetingId)
    questionsByMeetingId.value = {
      ...questionsByMeetingId.value,
      [meetingId]: [...existing, data]
    }
    return data
  }

  async function declineIncomingCall(meetingId, { silent = false } = {}) {
    clearIncomingCall(meetingId)
    try {
      await api.patch(`/meetings/${meetingId}`, { action: 'decline' })
    } catch (error) {
      if (!silent) {
        console.error('Failed to decline incoming call:', error)
      }
    }
  }

  async function acceptIncomingCall(meetingId) {
    clearIncomingCall(meetingId)
    return join(meetingId)
  }

  async function maybeCreateGroupFromMeetingParticipants(meetingId) {
    const meeting = await get(meetingId)
    if (meeting?.source_channel?.type === 'group') {
      return null
    }

    const dmsStore = useDmsStore()
    const channelsStore = useChannelsStore()
    const selfId = useSessionStore().user?.id

    const userIds = [...new Set((meeting.participants || [])
      .map((entry) => entry.user_id)
      .filter((id) => id && id !== selfId))]

    if (userIds.length < 2) {
      return null
    }

    const group = await dmsStore.createGroup(userIds, meeting.title || undefined)
    await channelsStore.select(group.id)
    return group
  }

  function resolveDisplayName(meeting) {
    return resolveMeetingDisplayTitle(meeting, { tFn: t })
  }

  function resolveSourceDisplayName(meeting) {
    return resolveMeetingSourceDisplayName(meeting, { tFn: t })
  }

  function resolveIncomingCallSourceName(call) {
    return resolveIncomingCallSourceDisplayName(call, { tFn: t })
  }

  function handleMeetingCreated(meeting) {
    upsertMeeting(meeting)
    if (shouldHydrateMeetingFromRealtime(meeting)) {
      ensureMeetingLoaded(meeting.id, { force: true }).catch(() => {
        scheduleRecoveryRefresh(true)
      })
    }
  }

  async function handleMeetingInvited(eventPayload) {
    if (!eventPayload?.meetingId) return

    const selfId = useSessionStore().user?.id
    if (Array.isArray(eventPayload.userIds) && selfId && !eventPayload.userIds.includes(selfId)) {
      return
    }

    let meeting = null
    try {
      meeting = await get(eventPayload.meetingId)
    } catch {
      await refresh(true)
    }

    const meetingStatus = eventPayload.meetingStatus || meeting?.status || null
    if (meetingStatus !== 'active') {
      return
    }

    const notificationPayload = {
      meeting_id: eventPayload.meetingId,
      source_channel_id: eventPayload.sourceChannelId || meeting?.source_channel_id || null,
      source_channel_name: eventPayload.sourceChannelName || meeting?.source_channel?.name || null,
      source_channel_display_name: eventPayload.sourceChannelDisplayName || meeting?.source_channel?.display_name || null,
      title: eventPayload.meetingTitle || meeting?.title || null
    }

    upsertIncomingCall({
      ...notificationPayload,
      received_at: Date.now()
    })

    window.$notification?.info({
      ...buildIncomingCallToast(notificationPayload, meeting)
    })
  }

  function handleMeetingJoined(eventPayload) {
    if (!eventPayload?.meetingId) return
    const selfId = useSessionStore().user?.id
    if (eventPayload.userId === selfId) {
      clearIncomingCall(eventPayload.meetingId)
    }

    const shouldSync = activeMeetingId.value === eventPayload.meetingId
      || !!getMeetingById(eventPayload.meetingId)

    if (!shouldSync) {
      return
    }

    ensureMeetingLoaded(eventPayload.meetingId, { force: true }).catch(() => {
      scheduleRecoveryRefresh(true)
    })
  }

  async function handleMeetingEnded(eventPayload) {
    if (!eventPayload?.meetingId) return
    clearIncomingCall(eventPayload.meetingId)

    const endedMeeting = meetings.value.find((entry) => entry.id === eventPayload.meetingId)
      || (activeMeetingId.value === eventPayload.meetingId ? activeMeeting.value : null)
    const endedChatChannelId = eventPayload.chatChannelId || endedMeeting?.chat_channel_id || null

    const voiceStore = useVoiceStore()
    if (endedChatChannelId && voiceStore.channelId === endedChatChannelId) {
      try {
        await voiceStore.leave({
          playLeaveSfx: false,
          notifyErrors: false,
          skipBackendLeave: true
        })
      } catch {
        // Ignore; meeting cleanup should still continue.
      }
    }

    removeOrArchiveMeetingLocally(eventPayload.meetingId, eventPayload)
    if (endedChatChannelId) {
      voiceStore.clearChannelState(endedChatChannelId)
    }

    ensureMeetingLoaded(eventPayload.meetingId, { force: true }).catch(() => {
      scheduleRecoveryRefresh(true)
    })
  }

  function handleArtifactsQueued(eventPayload) {
    if (!eventPayload?.meetingId) return
    const shouldSync = activeMeetingId.value === eventPayload.meetingId
      || !!getMeetingById(eventPayload.meetingId)

    if (!shouldSync) {
      return
    }

    ensureMeetingLoaded(eventPayload.meetingId, { force: true }).catch(() => {
      scheduleRecoveryRefresh(true)
    })
  }

  function handleArtifactsUpdated(eventPayload) {
    if (!eventPayload?.meetingId) return
    const shouldSync = activeMeetingId.value === eventPayload.meetingId
      || !!getMeetingById(eventPayload.meetingId)

    if (!shouldSync) {
      return
    }

    ensureMeetingLoaded(eventPayload.meetingId, { force: true }).catch(() => {
      scheduleRecoveryRefresh(true)
    })
  }

  function handleRecordingStateUpdated(eventPayload) {
    if (!eventPayload?.meetingId) return
    const shouldSync = activeMeetingId.value === eventPayload.meetingId
      || !!getMeetingById(eventPayload.meetingId)

    if (!shouldSync) {
      return
    }

    ensureMeetingLoaded(eventPayload.meetingId, { force: true }).catch(() => {
      scheduleRecoveryRefresh(true)
    })
  }

  return {
    meetings,
    activeMeetingId,
    activeMeeting,
    incomingCalls,
    activeSourceChannelIds,
    reset,
    clearActive,
    hasMeetingChatChannel,
    hasActiveMeetingForSourceChannel,
    findMeetingByChatChannelId,
    upsertMeeting,
    ensureMeetingChannel,
    refresh,
    loadOverviewBuckets,
    get,
    getMeetingById,
    ensureMeetingLoaded,
    fetchActiveBySourceChannel,
    fetchBySourceChannel,
    setActive,
    startFromChannel,
    scheduleFromChannel,
    invite,
    join,
    end,
    cancel,
    decline,
    setTitle,
    setLanguage,
    reschedule,
    createInviteLink,
    revokeInviteLink,
    generateSummary,
    generateTranscript,
    pauseTranscriptionRecording,
    resumeTranscriptionRecording,
    getQuestions,
    loadQuestions,
    askQuestion,
    acceptIncomingCall,
    declineIncomingCall,
    maybeCreateGroupFromMeetingParticipants,
    resolveDisplayName,
    resolveSourceDisplayName,
    resolveIncomingCallSourceName,
    handleMeetingCreated,
    handleMeetingInvited,
    handleMeetingJoined,
    handleMeetingEnded,
    handleArtifactsQueued,
    handleArtifactsUpdated,
    handleRecordingStateUpdated
  }
})
