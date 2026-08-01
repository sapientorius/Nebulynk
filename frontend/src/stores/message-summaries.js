import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'
import {
  compareSummariesByTimeline,
  summaryOverlapsWindow
} from '../lib/message-summaries.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function uniqueIds(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

export const useMessageSummariesStore = defineStore('messageSummaries', () => {
  const summariesByChannelId = ref({})
  const activeWindowByChannelId = ref({})
  const loadedWindowKeyByChannelId = ref({})
  const loadingByWindowKey = ref({})
  const requestLoadingByKey = ref({})
  const selectionMode = ref(false)
  const selectedMessageIds = ref([])

  const selectedCount = computed(() => selectedMessageIds.value.length)

  function summariesForChannel(channelId) {
    return channelId ? summariesByChannelId.value[channelId] || [] : []
  }

  function buildWindowKey({ channelId, windowStartAt, windowEndAt }) {
    return channelId && windowStartAt && windowEndAt
      ? `${channelId}:${windowStartAt}:${windowEndAt}`
      : ''
  }

  function currentWindowForChannel(channelId) {
    return channelId ? activeWindowByChannelId.value[channelId] || null : null
  }

  function setChannelSummaries(channelId, summaries = []) {
    if (!channelId) return
    summariesByChannelId.value = {
      ...summariesByChannelId.value,
      [channelId]: [...summaries].sort(compareSummariesByTimeline)
    }
  }

  function setChannelWindow(channelId, window) {
    if (!channelId) return
    const next = { ...activeWindowByChannelId.value }
    if (!window?.startAt || !window?.endAt) {
      delete next[channelId]
    } else {
      next[channelId] = {
        startAt: window.startAt,
        endAt: window.endAt,
        key: buildWindowKey({
          channelId,
          windowStartAt: window.startAt,
          windowEndAt: window.endAt
        })
      }
    }
    activeWindowByChannelId.value = next
  }

  function clearChannel(channelId) {
    if (!channelId) return
    const nextSummaries = { ...summariesByChannelId.value }
    delete nextSummaries[channelId]
    summariesByChannelId.value = nextSummaries

    const nextWindows = { ...activeWindowByChannelId.value }
    delete nextWindows[channelId]
    activeWindowByChannelId.value = nextWindows

    const nextLoadedKeys = { ...loadedWindowKeyByChannelId.value }
    delete nextLoadedKeys[channelId]
    loadedWindowKeyByChannelId.value = nextLoadedKeys
  }

  function ingestSummary(summary) {
    if (!summary?.id || !summary.channel_id) return
    const current = summariesForChannel(summary.channel_id)
    const index = current.findIndex((entry) => entry.id === summary.id)
    const next = index === -1
      ? [...current, summary]
      : current.map((entry) => (entry.id === summary.id ? { ...entry, ...summary } : entry))
    setChannelSummaries(summary.channel_id, next)
  }

  function removeLocalSummary(summary) {
    if (!summary?.id || !summary.channel_id) return
    const current = summariesForChannel(summary.channel_id)
    setChannelSummaries(
      summary.channel_id,
      current.filter((entry) => entry.id !== summary.id)
    )
  }

  async function loadForWindow({ channelId, windowStartAt, windowEndAt } = {}) {
    const windowKey = buildWindowKey({ channelId, windowStartAt, windowEndAt })
    if (!windowKey) {
      clearChannel(channelId)
      return []
    }
    if (loadedWindowKeyByChannelId.value[channelId] === windowKey) {
      return summariesForChannel(channelId)
    }
    if (loadingByWindowKey.value[windowKey]) return summariesForChannel(channelId)

    loadingByWindowKey.value = {
      ...loadingByWindowKey.value,
      [windowKey]: true
    }
    try {
      const { data } = await api.get('/message-summaries', {
        params: {
          channel_id: channelId,
          window_start_at: windowStartAt,
          window_end_at: windowEndAt
        }
      })
      const summaries = asList(data)
      setChannelSummaries(channelId, summaries)
      setChannelWindow(channelId, {
        startAt: windowStartAt,
        endAt: windowEndAt
      })
      loadedWindowKeyByChannelId.value = {
        ...loadedWindowKeyByChannelId.value,
        [channelId]: windowKey
      }
      return summaries
    } finally {
      const next = { ...loadingByWindowKey.value }
      delete next[windowKey]
      loadingByWindowKey.value = next
    }
  }

  function requestKey(scope, id = '') {
    return `${scope}:${id}`
  }

  function isRequestLoading(scope, id = '') {
    return Boolean(requestLoadingByKey.value[requestKey(scope, id)])
  }

  async function requestSummary(payload, key = requestKey(payload.scope, payload.message_id || payload.channel_id)) {
    if (!payload?.channel_id || !payload?.scope) return null
    requestLoadingByKey.value = {
      ...requestLoadingByKey.value,
      [key]: true
    }
    try {
      const { data } = await api.post('/message-summaries', payload)
      ingestSummary(data)
      return data
    } finally {
      const next = { ...requestLoadingByKey.value }
      delete next[key]
      requestLoadingByKey.value = next
    }
  }

  function requestMessageSummary(message) {
    if (!message?.id || !message.channel_id) return null
    return requestSummary({
      channel_id: message.channel_id,
      scope: 'message',
      message_id: message.id
    }, requestKey('message', message.id))
  }

  function requestSelectedSummary(channelId) {
    const messageIds = uniqueIds(selectedMessageIds.value)
    if (!channelId || messageIds.length < 2) return null
    return requestSummary({
      channel_id: channelId,
      scope: 'selection',
      message_ids: messageIds
    }, requestKey('selection', channelId))
  }

  function requestRangeSummary(channelId, rangePayload) {
    if (!channelId) return null
    return requestSummary({
      channel_id: channelId,
      scope: 'range',
      ...rangePayload
    }, requestKey('range', channelId))
  }

  function startSelection() {
    selectionMode.value = true
    selectedMessageIds.value = []
  }

  function cancelSelection() {
    selectionMode.value = false
    selectedMessageIds.value = []
  }

  function toggleSelected(messageId) {
    if (!messageId) return
    const selected = selectedMessageIds.value.includes(messageId)
    selectedMessageIds.value = selected
      ? selectedMessageIds.value.filter((id) => id !== messageId)
      : [...selectedMessageIds.value, messageId]
  }

  function isSelected(messageId) {
    return selectedMessageIds.value.includes(messageId)
  }

  function applyRealtimeSummary(summary) {
    if (!summary?.channel_id) return
    const currentWindow = currentWindowForChannel(summary.channel_id)
    if (!currentWindow) return
    if (!summaryOverlapsWindow(summary, currentWindow)) return
    ingestSummary(summary)
  }

  function applyRealtimeSummaryRemoved(summary) {
    removeLocalSummary(summary)
  }

  async function deleteSummary(summary) {
    if (!summary?.id) return null
    const { data } = await api.delete(`/message-summaries/${summary.id}`)
    removeLocalSummary(data?.id ? data : summary)
    return data
  }

  function reset() {
    summariesByChannelId.value = {}
    activeWindowByChannelId.value = {}
    loadedWindowKeyByChannelId.value = {}
    loadingByWindowKey.value = {}
    requestLoadingByKey.value = {}
    selectionMode.value = false
    selectedMessageIds.value = []
  }

  return {
    summariesByChannelId,
    activeWindowByChannelId,
    loadedWindowKeyByChannelId,
    loadingByWindowKey,
    requestLoadingByKey,
    selectionMode,
    selectedMessageIds,
    selectedCount,
    summariesForChannel,
    currentWindowForChannel,
    loadForWindow,
    ingestSummary,
    removeLocalSummary,
    requestSummary,
    requestMessageSummary,
    requestSelectedSummary,
    requestRangeSummary,
    startSelection,
    cancelSelection,
    toggleSelected,
    isSelected,
    isRequestLoading,
    applyRealtimeSummary,
    applyRealtimeSummaryRemoved,
    deleteSummary,
    clearChannel,
    reset
  }
})
