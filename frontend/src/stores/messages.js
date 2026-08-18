import { ref } from 'vue'
import { defineStore } from 'pinia'
import api, { getCurrentUser } from '../lib/api.js'
import { useChannelsStore } from './channels.js'
import { useVoiceMessageArtifactsStore } from './voice-message-artifacts.js'

const DRAFT_STORAGE_PREFIX = 'nebulynk:message-drafts:v1'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

function getDraftStorage() {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
  return localStorage
}

function getDraftStorageKey() {
  const userId = getCurrentUser()?.id
  return userId ? `${DRAFT_STORAGE_PREFIX}:${userId}` : null
}

function sanitizeDraftText(value) {
  return typeof value === 'string' ? value : ''
}

function sanitizeDraftFile(file) {
  if (!file?.id) return null
  return {
    id: file.id,
    original_name: file.original_name || file.name || 'file',
    mime_type: file.mime_type || null,
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
    purpose: file.purpose || 'attachment',
    duration_ms: file.duration_ms ?? null
  }
}

function buildRuntimeDraftFile(file) {
  if (!file?.id) return null
  return {
    ...sanitizeDraftFile(file),
    url: file.url || null
  }
}

function sanitizeStoredDraft(rawDraft) {
  if (!rawDraft || typeof rawDraft !== 'object') return null

  const text = sanitizeDraftText(rawDraft.text)
  const files = Array.isArray(rawDraft.files)
    ? rawDraft.files.map(sanitizeDraftFile).filter(Boolean)
    : []

  if (!text && files.length === 0) return null

  return {
    text,
    files,
    updated_at: rawDraft.updated_at || new Date().toISOString()
  }
}

function stripDraftForStorage(draft) {
  const sanitized = sanitizeStoredDraft(draft)
  if (!sanitized) return null
  return {
    ...sanitized,
    files: sanitized.files.map(sanitizeDraftFile).filter(Boolean)
  }
}

function sortMessagesByCreatedAt(items) {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime()
    const rightTime = new Date(right.created_at || 0).getTime()
    if (leftTime !== rightTime) return leftTime - rightTime
    return String(left.id || '').localeCompare(String(right.id || ''))
  })
}

function mergeUniqueMessages(existingItems, incomingItems) {
  const merged = new Map()

  for (const item of existingItems || []) {
    if (item?.id) merged.set(item.id, item)
  }

  for (const item of incomingItems || []) {
    if (item?.id) {
      merged.set(item.id, {
        ...(merged.get(item.id) || {}),
        ...item
      })
    }
  }

  return sortMessagesByCreatedAt([...merged.values()])
}

export const useMessagesStore = defineStore('messages', () => {
  const messages = ref([])
  const loading = ref(false)
  const loadingOlder = ref(false)
  const loadingNewer = ref(false)
  const timelineMode = ref('latest')
  const hasMoreOlder = ref(true)
  const hasMoreNewer = ref(false)
  const anchorMessageId = ref(null)
  const pinnedMessages = ref([])
  const replyContext = ref(null)
  const forwardContext = ref(null)
  const highlightedMessageId = ref(null)
  const draftsByChannel = ref({})
  const draftFilesHydratingByChannel = ref({})
  let hydratedDraftStorageKey = null

  function ensureDraftsHydrated() {
    const storage = getDraftStorage()
    const storageKey = getDraftStorageKey()
    if (!storage || !storageKey) {
      draftsByChannel.value = {}
      hydratedDraftStorageKey = storageKey
      return
    }

    if (hydratedDraftStorageKey === storageKey) return

    try {
      const raw = storage.getItem(storageKey)
      const parsed = raw ? JSON.parse(raw) : {}
      const nextDrafts = {}
      for (const [channelId, draft] of Object.entries(parsed || {})) {
        const sanitized = sanitizeStoredDraft(draft)
        if (channelId && sanitized) {
          nextDrafts[channelId] = sanitized
        }
      }
      draftsByChannel.value = nextDrafts
    } catch {
      draftsByChannel.value = {}
    }

    hydratedDraftStorageKey = storageKey
  }

  function persistDrafts() {
    const storage = getDraftStorage()
    const storageKey = getDraftStorageKey()
    if (!storage || !storageKey) return

    const payload = {}
    for (const [channelId, draft] of Object.entries(draftsByChannel.value)) {
      const storedDraft = stripDraftForStorage(draft)
      if (channelId && storedDraft) {
        payload[channelId] = storedDraft
      }
    }

    if (Object.keys(payload).length === 0) {
      storage.removeItem(storageKey)
      return
    }

    storage.setItem(storageKey, JSON.stringify(payload))
  }

  function updateDraft(channelId, patch) {
    ensureDraftsHydrated()
    if (!channelId) return null

    const current = draftsByChannel.value[channelId] || { text: '', files: [] }
    const nextDraft = {
      text: sanitizeDraftText(
        Object.prototype.hasOwnProperty.call(patch, 'text') ? patch.text : current.text
      ),
      files: Object.prototype.hasOwnProperty.call(patch, 'files') ? patch.files : current.files,
      updated_at: new Date().toISOString()
    }
    nextDraft.files = Array.isArray(nextDraft.files)
      ? nextDraft.files.map(buildRuntimeDraftFile).filter(Boolean)
      : []

    const sanitized = sanitizeStoredDraft(nextDraft)
    const nextDrafts = { ...draftsByChannel.value }
    if (!sanitized) {
      delete nextDrafts[channelId]
    } else {
      nextDrafts[channelId] = {
        ...nextDraft,
        files: nextDraft.files
      }
    }

    draftsByChannel.value = nextDrafts
    persistDrafts()
    return draftsByChannel.value[channelId] || { text: '', files: [] }
  }

  function getDraft(channelId) {
    ensureDraftsHydrated()
    const draft = channelId ? draftsByChannel.value[channelId] : null
    return {
      text: draft?.text || '',
      files: Array.isArray(draft?.files) ? draft.files : [],
      updated_at: draft?.updated_at || null
    }
  }

  function setDraftText(channelId, text) {
    return updateDraft(channelId, { text })
  }

  function addDraftFile(channelId, file) {
    if (!channelId || !file?.id) return null
    const draft = getDraft(channelId)
    const nextFiles = draft.files.filter((entry) => entry.id !== file.id)
    nextFiles.push(buildRuntimeDraftFile(file))
    return updateDraft(channelId, { files: nextFiles })
  }

  function appendDraftContent(channelId, { text = '', files = [] } = {}) {
    if (!channelId) return null

    const draft = getDraft(channelId)
    const nextText = sanitizeDraftText(text).trim()
    const existingText = sanitizeDraftText(draft.text)
    const hasExistingText = existingText.trim().length > 0
    const joinedText = hasExistingText && nextText
      ? `${existingText.replace(/\s+$/, '')}\n\n${nextText}`
      : hasExistingText ? existingText : nextText
    const nextFiles = [...draft.files]

    for (const file of files || []) {
      const normalized = buildRuntimeDraftFile(file)
      if (!normalized || nextFiles.some((entry) => entry.id === normalized.id)) continue
      nextFiles.push(normalized)
    }

    return updateDraft(channelId, {
      text: joinedText,
      files: nextFiles
    })
  }

  function removeDraftFile(channelId, fileId) {
    if (!channelId || !fileId) return null
    const draft = getDraft(channelId)
    return updateDraft(channelId, {
      files: draft.files.filter((file) => file.id !== fileId)
    })
  }

  function clearDraft(channelId) {
    ensureDraftsHydrated()
    if (!channelId || !draftsByChannel.value[channelId]) return

    const nextDrafts = { ...draftsByChannel.value }
    delete nextDrafts[channelId]
    draftsByChannel.value = nextDrafts
    persistDrafts()
  }

  function setDraftFilesHydrating(channelId, value) {
    if (!channelId) return
    draftFilesHydratingByChannel.value = {
      ...draftFilesHydratingByChannel.value,
      [channelId]: Boolean(value)
    }
  }

  async function hydrateDraftFiles(channelId) {
    const draft = getDraft(channelId)
    if (!channelId || draft.files.length === 0) return draft.files

    setDraftFilesHydrating(channelId, true)
    try {
      const hydratedFiles = []
      for (const file of draft.files) {
        try {
          const { data } = await api.get(`/files/${file.id}`)
          const hydrated = buildRuntimeDraftFile(data)
          if (hydrated) hydratedFiles.push(hydrated)
        } catch {
          // Drop files that are no longer readable by the current user.
        }
      }
      updateDraft(channelId, { files: hydratedFiles })
      return hydratedFiles
    } finally {
      setDraftFilesHydrating(channelId, false)
    }
  }

  function clearStoredDrafts() {
    const storage = getDraftStorage()
    const storageKey = getDraftStorageKey()
    draftsByChannel.value = {}
    hydratedDraftStorageKey = storageKey
    if (storage && storageKey) {
      storage.removeItem(storageKey)
    }
  }

  function updateTimelineEdges() {
    const oldestMessage = messages.value[0] || null
    const newestMessage = messages.value[messages.value.length - 1] || null
    return {
      oldestCreatedAt: oldestMessage?.created_at || null,
      oldestId: oldestMessage?.id || null,
      newestCreatedAt: newestMessage?.created_at || null,
      newestId: newestMessage?.id || null
    }
  }

  function applyTimelinePayload(items, {
    mode = 'latest',
    append = false,
    prepend = false,
    hasMoreBefore = false,
    hasMoreAfter = false,
    nextAnchorMessageId = null
  } = {}) {
    const nextMessages = append
      ? mergeUniqueMessages(messages.value, items)
      : prepend
        ? mergeUniqueMessages(items, messages.value)
        : mergeUniqueMessages([], items)

    messages.value = nextMessages
    useVoiceMessageArtifactsStore().ingestMessages(nextMessages)
    timelineMode.value = mode
    hasMoreOlder.value = Boolean(hasMoreBefore)
    hasMoreNewer.value = Boolean(hasMoreAfter)
    anchorMessageId.value = nextAnchorMessageId || null
    return updateTimelineEdges()
  }

  function reset() {
    messages.value = []
    loading.value = false
    loadingOlder.value = false
    loadingNewer.value = false
    timelineMode.value = 'latest'
    hasMoreOlder.value = true
    hasMoreNewer.value = false
    anchorMessageId.value = null
    pinnedMessages.value = []
    replyContext.value = null
    forwardContext.value = null
    highlightedMessageId.value = null
    draftsByChannel.value = {}
    draftFilesHydratingByChannel.value = {}
    hydratedDraftStorageKey = null
  }

  function resetChannelMessages() {
    messages.value = []
    loadingOlder.value = false
    loadingNewer.value = false
    timelineMode.value = 'latest'
    hasMoreOlder.value = true
    hasMoreNewer.value = false
    anchorMessageId.value = null
    pinnedMessages.value = []
    replyContext.value = null
    highlightedMessageId.value = null
  }

  async function loadLatest() {
    const channelsStore = useChannelsStore()
    if (loading.value || !channelsStore.activeChannelId) return

    loading.value = true
    try {
      const params = {
        channel_id: channelsStore.activeChannelId,
        $limit: 50
      }
      const { data } = await api.get('/messages', { params })
      const items = asList(data)
      applyTimelinePayload(items, {
        mode: 'latest',
        hasMoreBefore: data?.has_more_before ?? items.length >= 50,
        hasMoreAfter: false
      })
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadAroundMessage(messageId, options = {}) {
    const channelsStore = useChannelsStore()
    const channelId = options.channelId || channelsStore.activeChannelId
    if (!messageId || !channelId || loading.value) return null

    loading.value = true
    try {
      const { data } = await api.get('/messages', {
        params: {
          channel_id: channelId,
          around_message_id: messageId
        }
      })
      const items = asList(data)
      applyTimelinePayload(items, {
        mode: 'anchored',
        hasMoreBefore: data?.has_more_before,
        hasMoreAfter: data?.has_more_after,
        nextAnchorMessageId: data?.anchor_message_id || messageId
      })
      return items.find((entry) => entry.id === messageId) || null
    } catch (error) {
      console.error('Failed to load anchored message context:', error)
      highlightedMessageId.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  async function loadOlder() {
    const channelsStore = useChannelsStore()
    if (loadingOlder.value || loading.value || !channelsStore.activeChannelId) return []
    const oldestMessage = messages.value[0]
    if (!oldestMessage?.created_at) return []

    loadingOlder.value = true
    try {
      const { data } = await api.get('/messages', {
        params: {
          channel_id: channelsStore.activeChannelId,
          $limit: 50,
          before: oldestMessage.created_at,
          before_id: oldestMessage.id
        }
      })
      const items = asList(data)
      applyTimelinePayload(items, {
        mode: timelineMode.value,
        prepend: true,
        hasMoreBefore: data?.has_more_before ?? items.length >= 50,
        hasMoreAfter: hasMoreNewer.value,
        nextAnchorMessageId: anchorMessageId.value
      })
      return items
    } catch (error) {
      console.error('Failed to load older messages:', error)
      return []
    } finally {
      loadingOlder.value = false
    }
  }

  async function loadNewer() {
    const channelsStore = useChannelsStore()
    if (loadingNewer.value || loading.value || !channelsStore.activeChannelId) return []
    const newestMessage = messages.value[messages.value.length - 1]
    if (!newestMessage?.created_at) return []

    loadingNewer.value = true
    try {
      const { data } = await api.get('/messages', {
        params: {
          channel_id: channelsStore.activeChannelId,
          $limit: 50,
          after: newestMessage.created_at,
          after_id: newestMessage.id
        }
      })
      const items = asList(data)
      applyTimelinePayload(items, {
        mode: timelineMode.value,
        append: true,
        hasMoreBefore: hasMoreOlder.value,
        hasMoreAfter: data?.has_more_after ?? items.length >= 50,
        nextAnchorMessageId: anchorMessageId.value
      })
      return items
    } catch (error) {
      console.error('Failed to load newer messages:', error)
      return []
    } finally {
      loadingNewer.value = false
    }
  }

  async function returnToLatest() {
    await loadLatest()
  }

  async function syncActiveTimelineFromLatest() {
    const channelsStore = useChannelsStore()
    if (!channelsStore.activeChannelId) return []
    if (timelineMode.value !== 'latest') return []

    if (messages.value.length === 0) {
      await loadLatest()
      return messages.value
    }

    return loadNewer()
  }

  async function ensureMessageLoaded(messageId) {
    if (!messageId) return null
    const existing = messages.value.find((entry) => entry.id === messageId)
    if (existing) return existing

    try {
      const { data } = await api.get(`/messages/${messageId}`)
      if (data?.channel_id === useChannelsStore().activeChannelId) {
        upsertMessage(data)
      }
      return data
    } catch (error) {
      console.error('Failed to load message:', error)
      return null
    }
  }

  async function sendToChannel(channelId, content, options = {}) {
    const { fileIds, replyToMessageId } = options
    const hasContent = content && content.trim()
    const hasFiles = fileIds && fileIds.length > 0
    if (!hasContent && !hasFiles) return
    if (!channelId) return

    try {
      const payload = {
        channel_id: channelId,
        content: hasContent ? content.trim() : ''
      }
      if (hasFiles) {
        payload.file_ids = fileIds
      }
      if (replyToMessageId) {
        payload.reply_to_message_id = replyToMessageId
      }

      const { data } = await api.post('/messages', payload)
      if (channelId === useChannelsStore().activeChannelId) {
        addMessageIfMissing(data)
        clearReply()
      }
      return data
    } catch (error) {
      console.error('Failed to send message:', error)
      throw error
    }
  }

  async function send(content, options = {}) {
    const channelsStore = useChannelsStore()
    if (!channelsStore.activeChannelId) return
    return sendToChannel(channelsStore.activeChannelId, content, options)
  }

  async function forward({ sourceMessageId, sourceUrl, targetChannelId, comment }) {
    const payload = {
      target_channel_id: targetChannelId
    }
    if (sourceMessageId) payload.source_message_id = sourceMessageId
    if (sourceUrl) payload.source_url = sourceUrl
    if (comment?.trim()) payload.comment = comment.trim()

    const { data } = await api.post('/messages/forward', payload)
    if (data?.channel_id === useChannelsStore().activeChannelId) {
      addMessageIfMissing(data)
    }
    return data
  }

  async function loadPins(channelId) {
    if (!channelId) return
    try {
      const { data } = await api.get('/pinned-messages', {
        params: { channel_id: channelId }
      })
      pinnedMessages.value = asList(data)
    } catch (error) {
      console.error('Failed to load pinned messages:', error)
      pinnedMessages.value = []
    }
  }

  async function pin(messageId) {
    const channelsStore = useChannelsStore()
    try {
      await api.post('/pinned-messages', {
        channel_id: channelsStore.activeChannelId,
        message_id: messageId
      })
    } catch (error) {
      console.error('Failed to pin message:', error)
      throw error
    }
  }

  async function unpin(pinId) {
    try {
      await api.delete(`/pinned-messages/${pinId}`)
    } catch (error) {
      console.error('Failed to unpin message:', error)
      throw error
    }
  }

  function setReplyContext(message) {
    if (!message?.id) return
    replyContext.value = {
      id: message.id,
      user_display_name: message.user_display_name || null,
      content: message.content || '',
      deleted_at: message.deleted_at || null
    }
  }

  function clearReply() {
    replyContext.value = null
  }

  function openForward(message) {
    if (!message?.id) return
    forwardContext.value = message
  }

  function closeForward() {
    forwardContext.value = null
  }

  function setHighlightedMessage(messageId) {
    highlightedMessageId.value = messageId || null
  }

  function clearHighlightedMessage() {
    highlightedMessageId.value = null
  }

  function addMessageIfMissing(message) {
    if (!message?.id) return
    useVoiceMessageArtifactsStore().ingestMessage(message)
    if (!messages.value.find((entry) => entry.id === message.id)) {
      messages.value.push(message)
      messages.value = sortMessagesByCreatedAt(messages.value)
      hasMoreNewer.value = false
    }
  }

  function replaceMessage(message) {
    if (!message?.id) return
    useVoiceMessageArtifactsStore().ingestMessage(message)
    const index = messages.value.findIndex((entry) => entry.id === message.id)
    if (index !== -1) {
      messages.value[index] = {
        ...messages.value[index],
        ...message
      }
      messages.value = sortMessagesByCreatedAt(messages.value)
    }
  }

  function upsertMessage(message) {
    if (!message?.id) return
    useVoiceMessageArtifactsStore().ingestMessage(message)
    const index = messages.value.findIndex((entry) => entry.id === message.id)
    if (index === -1) {
      messages.value = sortMessagesByCreatedAt([...messages.value, message])
      return
    }
    messages.value[index] = message
    messages.value = sortMessagesByCreatedAt(messages.value)
  }

  function removeMessage(messageId) {
    messages.value = messages.value.filter((entry) => entry.id !== messageId)
  }

  function applyReactionCreated(reaction) {
    const message = messages.value.find((entry) => entry.id === reaction.message_id)
    if (!message) return
    if (!message.reactions) message.reactions = []

    const group = message.reactions.find((entry) => entry.emoji === reaction.emoji)
    if (group) {
      if (!group.users.some((entry) => entry.user_id === reaction.user_id)) {
        group.count++
        group.users.push({
          id: reaction.id,
          user_id: reaction.user_id,
          display_name: reaction.user_display_name
        })
      }
      return
    }

    message.reactions.push({
      emoji: reaction.emoji,
      count: 1,
      users: [{
        id: reaction.id,
        user_id: reaction.user_id,
        display_name: reaction.user_display_name
      }]
    })
  }

  function applyReactionRemoved(reaction) {
    const message = messages.value.find((entry) => entry.id === reaction.message_id)
    if (!message || !message.reactions) return
    const group = message.reactions.find((entry) => entry.emoji === reaction.emoji)
    if (!group) return

    group.users = group.users.filter((entry) => entry.user_id !== reaction.user_id)
    group.count = group.users.length
    if (group.count === 0) {
      message.reactions = message.reactions.filter((entry) => entry.emoji !== reaction.emoji)
    }
  }

  function addPin(pin) {
    const channelsStore = useChannelsStore()
    if (!pin?.id || pin.channel_id !== channelsStore.activeChannelId) return
    if (!pinnedMessages.value.find((entry) => entry.id === pin.id)) {
      pinnedMessages.value.unshift(pin)
    }
  }

  function removePin(pinId) {
    pinnedMessages.value = pinnedMessages.value.filter((entry) => entry.id !== pinId)
  }

  return {
    messages,
    loading,
    loadingOlder,
    loadingNewer,
    timelineMode,
    hasMoreOlder,
    hasMoreNewer,
    anchorMessageId,
    pinnedMessages,
    replyContext,
    forwardContext,
    highlightedMessageId,
    draftsByChannel,
    draftFilesHydratingByChannel,
    reset,
    resetChannelMessages,
    loadLatest,
    loadAroundMessage,
    loadOlder,
    loadNewer,
    returnToLatest,
    syncActiveTimelineFromLatest,
    ensureMessageLoaded,
    send,
    sendToChannel,
    forward,
    loadPins,
    pin,
    unpin,
    setReplyContext,
    clearReply,
    getDraft,
    setDraftText,
    addDraftFile,
    appendDraftContent,
    removeDraftFile,
    clearDraft,
    hydrateDraftFiles,
    clearStoredDrafts,
    openForward,
    closeForward,
    setHighlightedMessage,
    clearHighlightedMessage,
    addMessageIfMissing,
    replaceMessage,
    upsertMessage,
    removeMessage,
    applyReactionCreated,
    applyReactionRemoved,
    addPin,
    removePin
  }
})
