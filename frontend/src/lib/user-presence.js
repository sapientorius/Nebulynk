const VALID_PRESENCE_STATUSES = new Set(['online', 'away', 'dnd', 'offline'])

export const PRESENCE_STATUS_COLORS = {
  online: '#52c41a',
  away: '#faad14',
  dnd: '#ff4d4f',
  offline: '#8c8c8c',
  default: '#8c8c8c'
}

function getUserIdentity(user) {
  if (!user || typeof user !== 'object') return null
  return user.id || user.user_id || null
}

export function normalizePresenceStatus(status, fallback = 'offline') {
  return VALID_PRESENCE_STATUSES.has(status) ? status : fallback
}

export function getPresenceStatusColor(status) {
  return PRESENCE_STATUS_COLORS[status] || PRESENCE_STATUS_COLORS.default
}

export function resolveUserPresenceState({
  user = null,
  currentUserId = null,
  onlineUserIds = [],
  presenceSyncPending = false
} = {}) {
  const userId = getUserIdentity(user)
  const normalizedStatus = normalizePresenceStatus(user?.status)
  const onlineIdSet = onlineUserIds instanceof Set
    ? onlineUserIds
    : new Set(Array.isArray(onlineUserIds) ? onlineUserIds.filter(Boolean) : [])
  const isSelf = Boolean(userId && currentUserId && userId === currentUserId)
  const isPendingSync = Boolean(isSelf && presenceSyncPending && !onlineIdSet.has(userId))
  const isConnected = Boolean(userId && (onlineIdSet.has(userId) || isPendingSync))

  if (!isConnected) {
    return {
      isConnected: false,
      displayStatus: 'offline',
      badgeStatus: 'offline',
      isPendingSync: false
    }
  }

  if (isPendingSync) {
    return {
      isConnected: true,
      displayStatus: normalizedStatus === 'away' || normalizedStatus === 'dnd'
        ? normalizedStatus
        : 'online',
      badgeStatus: 'default',
      isPendingSync: true
    }
  }

  return {
    isConnected: true,
    displayStatus: normalizedStatus === 'offline'
      ? 'offline'
      : normalizedStatus || 'online',
    badgeStatus: normalizedStatus === 'offline'
      ? 'offline'
      : normalizedStatus || 'online',
    isPendingSync: false
  }
}
