function normalizeRoute(path) {
  if (typeof path !== 'string') return '/channels'
  const trimmed = path.trim()
  if (!trimmed) return '/channels'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function buildDesktopNotificationRoute({
  notification = null,
  meetingByChatChannelId = {}
} = {}) {
  if (!notification?.channel_id && !notification?.meeting_id) {
    return '/channels'
  }

  if (notification.type === 'meeting_invite' && notification.meeting_id) {
    return `/meetings/${notification.meeting_id}`
  }

  const meetingId = meetingByChatChannelId?.[notification.channel_id] || null
  if (meetingId) {
    return `/meetings/${meetingId}`
  }

  if (notification.channel_id) {
    if (notification.message_id) {
      return `/channels/${notification.channel_id}?message=${notification.message_id}`
    }
    return `/channels/${notification.channel_id}`
  }

  return '/channels'
}

export function normalizeDesktopNotificationTarget(payload = {}) {
  return {
    serverId: typeof payload.serverId === 'string' ? payload.serverId : null,
    route: normalizeRoute(payload.route)
  }
}

