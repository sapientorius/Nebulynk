import { isTechnicalDmChannelName, isTechnicalGroupChannelName } from './meeting-display.js'

function normalizeLabel(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function resolveTextChannelName(channel) {
  return normalizeLabel(channel?.display_name) || normalizeLabel(channel?.name) || normalizeLabel(channel?.id)
}

function resolveDmChannelName(channel, dmsStore) {
  const localChannel = dmsStore?.dmChannels?.find?.((entry) => entry.id === channel?.id) || channel
  const info = localChannel?.type === 'dm' || localChannel?.type === 'group'
    ? dmsStore?.displayInfo?.(localChannel)
    : null

  return normalizeLabel(info?.name)
    || normalizeLabel(localChannel?.display_name)
    || normalizeLabel(localChannel?.name)
    || normalizeLabel(localChannel?.id)
}

function resolveMeetingChannelName(meeting, meetingsStore) {
  if (!meeting?.chat_channel_id) return ''
  return normalizeLabel(meetingsStore?.resolveDisplayName?.(meeting))
    || normalizeLabel(meeting?.chat_channel?.display_name)
    || normalizeLabel(meeting?.chat_channel?.name)
    || normalizeLabel(meeting?.chat_channel_id)
}

function translate(tFn, key, params, fallback) {
  if (typeof tFn === 'function') {
    return tFn(key, params || {})
  }
  return fallback
}

export function formatSearchChannelOption(channel, { dmsStore, meetingsStore, tFn } = {}) {
  if (!channel?.id) return null

  if (channel.kind === 'meeting') {
    const meetingName = resolveMeetingChannelName(channel.meeting, meetingsStore)
    if (!meetingName) return null
    return {
      label: translate(tFn, 'search.option_labels.call', { name: meetingName }, `Call ${meetingName}`),
      value: channel.id
    }
  }

  if (channel.type === 'dm' || channel.type === 'group') {
    const name = resolveDmChannelName(channel, dmsStore)
    if (!name) return null
    return {
      label: `@ ${name}`,
      value: channel.id
    }
  }

  const textName = resolveTextChannelName(channel)
  if (!textName) return null
  return {
    label: `# ${textName}`,
    value: channel.id
  }
}

export function formatSearchResultChannelLabel(channel, { dmsStore, tFn } = {}) {
  if (!channel?.id && !channel?.name) return ''

  if (channel?.type === 'dm' || channel?.type === 'group') {
    const localChannel = dmsStore?.dmChannels?.find?.((entry) => entry.id === channel.id)
    if (localChannel) {
      const displayName = resolveDmChannelName(localChannel, dmsStore)
      if (displayName) return `@ ${displayName}`
    }
  }

  if (channel?.type === 'dm' && isTechnicalDmChannelName(channel?.name, channel?.id)) {
    return `@ ${translate(tFn, 'ui.views.direct_message_source', {}, 'Direct message')}`
  }

  if (channel?.type === 'group' && isTechnicalGroupChannelName(channel?.name, channel?.id)) {
    return `@ ${translate(tFn, 'ui.views.group_chat_source', {}, 'Group chat')}`
  }

  if (channel?.type === 'dm' || channel?.type === 'group') {
    const displayName = resolveDmChannelName(channel, dmsStore)
    if (displayName) return `@ ${displayName}`
  }

  const prefix = channel?.type === 'dm' || channel?.type === 'group' ? '@' : '#'
  const name = resolveTextChannelName(channel)
  return name ? `${prefix} ${name}` : ''
}
