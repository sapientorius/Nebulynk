function normalizeLabel(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function translate(tFn, key, params, fallback) {
  if (typeof tFn === 'function') {
    return tFn(key, params || {})
  }
  return fallback
}

export function isTechnicalDmChannelName(name, channelId = null) {
  const normalized = normalizeLabel(name)
  if (!normalized) return false
  if (channelId) return normalized === `dm-${channelId}`
  return /^dm-[a-z0-9]+$/i.test(normalized)
}

export function isTechnicalGroupChannelName(name, channelId = null) {
  const normalized = normalizeLabel(name)
  if (!normalized) return false
  if (channelId) return normalized === `group-${channelId}`
  return /^group-[a-z0-9]+$/i.test(normalized)
}

function isLikelyTechnicalMeetingChannelName(name, meetingId = null) {
  const normalized = normalizeLabel(name)
  if (!normalized) return false
  if (meetingId) return normalized === `meeting-${meetingId}`
  return /^meeting-[a-z0-9]+$/i.test(normalized)
}

export function isLegacyTechnicalMeetingTitle(meeting) {
  const title = normalizeLabel(meeting?.title)
  if (!title) return false

  const sourceType = normalizeLabel(meeting?.source_channel?.type)
  const sourceChannelId = normalizeLabel(meeting?.source_channel?.id || meeting?.source_channel_id)
  const sourceName = normalizeLabel(meeting?.source_channel?.name)

  const isTechnicalSourceName = sourceType === 'dm'
    ? isTechnicalDmChannelName(sourceName, sourceChannelId)
    : sourceType === 'group'
      ? isTechnicalGroupChannelName(sourceName, sourceChannelId)
      : false

  if (isTechnicalSourceName && sourceName && title === sourceName) {
    return true
  }

  if (sourceType === 'dm' && isTechnicalDmChannelName(title, sourceChannelId)) {
    return true
  }
  if (sourceType === 'group' && isTechnicalGroupChannelName(title, sourceChannelId)) {
    return true
  }

  return false
}

export function resolveMeetingSourceDisplayName(meeting, { tFn } = {}) {
  const explicitDisplayName = normalizeLabel(meeting?.source_channel?.display_name)
  if (explicitDisplayName) return explicitDisplayName

  const sourceType = normalizeLabel(meeting?.source_channel?.type)
  const sourceChannelId = normalizeLabel(meeting?.source_channel?.id || meeting?.source_channel_id)
  const sourceName = normalizeLabel(meeting?.source_channel?.name)

  if (sourceName) {
    if (isTechnicalDmChannelName(sourceName, sourceChannelId)) {
      return translate(tFn, 'ui.views.direct_message_source', {}, 'Direct message')
    }
    if (isTechnicalGroupChannelName(sourceName, sourceChannelId)) {
      return translate(tFn, 'ui.views.group_chat_source', {}, 'Group chat')
    }
    return sourceName
  }

  if (sourceType === 'dm') {
    return translate(tFn, 'ui.views.direct_message_source', {}, 'Direct message')
  }

  if (sourceType === 'group') {
    return translate(tFn, 'ui.views.group_chat_source', {}, 'Group chat')
  }

  return null
}

export function resolveMeetingDisplayTitle(meeting, { tFn } = {}) {
  if (!meeting) {
    return translate(tFn, 'ui.views.untitled_meeting', {}, 'Untitled meeting')
  }

  const title = normalizeLabel(meeting.title)
  if (title && !isLegacyTechnicalMeetingTitle(meeting)) {
    return title
  }

  const sourceType = normalizeLabel(meeting?.source_channel?.type)
  const sourceDisplayName = resolveMeetingSourceDisplayName(meeting, { tFn })
  if (sourceDisplayName) {
    if (sourceType === 'dm') {
      return translate(tFn, 'ui.views.call_with_name', { name: sourceDisplayName }, `Call with ${sourceDisplayName}`)
    }
    if (sourceType === 'group') {
      return translate(
        tFn,
        'ui.views.group_call_with_name',
        { name: sourceDisplayName },
        `Group call: ${sourceDisplayName}`
      )
    }
    return sourceDisplayName
  }

  const chatChannelName = normalizeLabel(meeting?.chat_channel?.name)
  if (chatChannelName && !isLikelyTechnicalMeetingChannelName(chatChannelName, meeting?.id || null)) {
    return chatChannelName
  }

  return translate(tFn, 'ui.views.untitled_meeting', {}, 'Untitled meeting')
}

export function resolveIncomingCallSourceDisplayName(call, { tFn } = {}) {
  const explicitDisplayName = normalizeLabel(call?.source_channel_display_name)
  if (explicitDisplayName) return explicitDisplayName

  const sourceChannelId = normalizeLabel(call?.source_channel_id)
  const sourceChannelName = normalizeLabel(call?.source_channel_name)
  if (sourceChannelName) {
    if (isTechnicalDmChannelName(sourceChannelName, sourceChannelId)) {
      return translate(tFn, 'ui.views.direct_message_source', {}, 'Direct message')
    }
    if (isTechnicalGroupChannelName(sourceChannelName, sourceChannelId)) {
      return translate(tFn, 'ui.views.group_chat_source', {}, 'Group chat')
    }
    return sourceChannelName
  }

  return translate(tFn, 'ui.components.unknown_channel', {}, 'Unknown channel')
}
