import { logger } from './logger.js'
import { removeVoiceParticipant } from './services/voice/voice.js'

// userId -> Set of connection objects
const onlineUsers = new Map()

// connection -> userId mapping (for disconnect lookup)
const connectionToUser = new Map()

// connection -> foreground state for channel-aware push suppression
const connectionForegroundState = new Map()

// Disconnect grace period timers (userId -> timeoutId)
const disconnectTimers = new Map()

// Users currently in an automatically applied away state.
const autoAwayUsers = new Set()

const DISCONNECT_GRACE_MS = 5000
export const DEFAULT_AUTO_AWAY_MINUTES = 15
export const DEFAULT_AUTO_AWAY_MS = DEFAULT_AUTO_AWAY_MINUTES * 60 * 1000

function normalizeIsoTimestamp(value, fallback = null) {
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim()
  if (!trimmed) return fallback

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString()
}

function getUserConnections(userId) {
  return onlineUsers.get(userId) || null
}

function getLatestUserActivityAt(userId) {
  const connections = getUserConnections(userId)
  if (!connections || connections.size === 0) return null

  let latestActivityMs = 0
  for (const connection of connections) {
    const lastActivityAt = connectionForegroundState.get(connection)?.lastActivityAt
    if (!lastActivityAt) continue

    const parsedMs = new Date(lastActivityAt).getTime()
    if (Number.isNaN(parsedMs)) continue
    if (parsedMs > latestActivityMs) {
      latestActivityMs = parsedMs
    }
  }

  return latestActivityMs > 0 ? new Date(latestActivityMs).toISOString() : null
}

async function getUserStatus(app, userId) {
  const db = app.get('postgresqlClient')
  return db('users')
    .where('id', userId)
    .first('id', 'status')
}

async function restoreAutomaticAwayStatusIfNeeded(app, userId) {
  if (!userId || !autoAwayUsers.has(userId)) return false

  const user = await getUserStatus(app, userId)
  if (!user || user.status !== 'away') {
    autoAwayUsers.delete(userId)
    return false
  }

  await app.service('users').patch(userId, { status: 'online' }, { autoAwayTransition: true })
  autoAwayUsers.delete(userId)
  logger.info(`User ${userId} automatically returned to online`)
  return true
}

export function getOnlineUserIds() {
  return [...onlineUsers.keys()]
}

export function isOnline(userId) {
  return onlineUsers.has(userId)
}

export function setConnectionForegroundState(connection, {
  activeChannelId = null,
  isVisible = false,
  updatedAt = new Date().toISOString(),
  lastActivityAt
} = {}) {
  if (!connection) return null

  const currentState = getConnectionForegroundState(connection)
  const normalizedChannelId = typeof activeChannelId === 'string' && activeChannelId.trim()
    ? activeChannelId.trim()
    : null
  const normalizedIsVisible = Boolean(isVisible)
  const nextState = {
    activeChannelId: normalizedIsVisible ? normalizedChannelId : null,
    isVisible: normalizedIsVisible,
    updatedAt: normalizeIsoTimestamp(updatedAt, new Date().toISOString()),
    lastActivityAt: lastActivityAt === undefined
      ? currentState.lastActivityAt
      : normalizeIsoTimestamp(lastActivityAt, currentState.lastActivityAt)
  }

  connectionForegroundState.set(connection, nextState)
  return nextState
}

export function getConnectionForegroundState(connection) {
  return connectionForegroundState.get(connection) || {
    activeChannelId: null,
    isVisible: false,
    updatedAt: null,
    lastActivityAt: null
  }
}

export function clearConnectionForegroundState(connection) {
  if (!connection) return
  connectionForegroundState.delete(connection)
}

export function clearAutoAwayState(userId) {
  if (!userId) return
  autoAwayUsers.delete(userId)
}

export function disconnectUserConnections(userId) {
  if (!userId) return 0

  const connections = onlineUsers.get(userId)
  if (!connections || connections.size === 0) return 0

  if (disconnectTimers.has(userId)) {
    clearTimeout(disconnectTimers.get(userId))
    disconnectTimers.delete(userId)
  }

  let disconnected = 0
  for (const connection of [...connections]) {
    try {
      if (typeof connection.disconnect === 'function') {
        connection.disconnect(true)
        disconnected += 1
      } else if (typeof connection.close === 'function') {
        connection.close()
        disconnected += 1
      }
    } catch (error) {
      logger.warn('Failed to disconnect user connection', {
        userId,
        error: error.message
      })
    }
  }

  return disconnected
}

export function isAutoAwayUser(userId) {
  return autoAwayUsers.has(userId)
}

export async function updateConnectionPresenceState(app, connection, {
  activeChannelId = null,
  isVisible = false,
  updatedAt = new Date().toISOString(),
  lastActivityAt
} = {}) {
  const state = setConnectionForegroundState(connection, {
    activeChannelId,
    isVisible,
    updatedAt,
    lastActivityAt
  })

  if (typeof lastActivityAt === 'string') {
    const userId = connectionToUser.get(connection)
    if (userId) {
      await restoreAutomaticAwayStatusIfNeeded(app, userId)
    }
  }

  return state
}

export async function getAutoAwayTimeoutMs(app) {
  try {
    const db = app.get('postgresqlClient')
    const row = await db('platform_settings').where('key', 'auto_away_minutes').first()
    const parsedMinutes = Number.parseInt(row?.value, 10)
    if (Number.isNaN(parsedMinutes) || parsedMinutes < 1) {
      return DEFAULT_AUTO_AWAY_MS
    }
    return parsedMinutes * 60 * 1000
  } catch (error) {
    logger.warn('Failed to load auto-away timeout, using default', { error: error.message })
    return DEFAULT_AUTO_AWAY_MS
  }
}

export async function runAutoAwaySweep(app, { now = new Date() } = {}) {
  const userIds = getOnlineUserIds()
  if (userIds.length === 0) {
    return { examined: 0, transitioned: 0 }
  }

  const db = app.get('postgresqlClient')
  const timeoutMs = await getAutoAwayTimeoutMs(app)
  const nowDate = now instanceof Date ? now : new Date(now)
  const nowMs = nowDate.getTime()

  const [users, activeVoiceRows] = await Promise.all([
    db('users')
      .whereIn('id', userIds)
      .select('id', 'status'),
    db('voice_participants')
      .whereIn('user_id', userIds)
      .distinct('user_id')
  ])

  const statusByUserId = new Map(users.map((user) => [user.id, user.status]))
  const activeVoiceUserIds = new Set(activeVoiceRows.map((row) => row.user_id))
  let transitioned = 0

  for (const userId of userIds) {
    if (autoAwayUsers.has(userId)) continue
    if (statusByUserId.get(userId) !== 'online') continue
    if (activeVoiceUserIds.has(userId)) continue

    const latestActivityAt = getLatestUserActivityAt(userId)
    if (!latestActivityAt) continue

    const lastActivityMs = new Date(latestActivityAt).getTime()
    if (Number.isNaN(lastActivityMs)) continue
    if (nowMs - lastActivityMs < timeoutMs) continue

    await app.service('users').patch(userId, { status: 'away' }, { autoAwayTransition: true })
    autoAwayUsers.add(userId)
    transitioned += 1

    logger.info(`User ${userId} automatically set to away`, {
      userId,
      lastActivityAt: latestActivityAt,
      timeoutMs
    })
  }

  return {
    examined: userIds.length,
    transitioned
  }
}

export function hasVisibleChannelSession(userId, channelId) {
  if (!userId || !channelId) return false
  const connections = onlineUsers.get(userId)
  if (!connections || connections.size === 0) return false

  for (const connection of connections) {
    const state = connectionForegroundState.get(connection)
    if (!state?.isVisible) continue
    if (state.activeChannelId === channelId) {
      return true
    }
  }

  return false
}

export function setupPresence(app) {
  app.on('login', async (authResult, { connection }) => {
    if (!connection) return

    const user = authResult.user
    if (!user?.id) return

    // Cancel any pending disconnect timer
    if (disconnectTimers.has(user.id)) {
      clearTimeout(disconnectTimers.get(user.id))
      disconnectTimers.delete(user.id)
    }

    // Track connection -> user mapping
    connectionToUser.set(connection, user.id)
    setConnectionForegroundState(connection, {
      activeChannelId: null,
      isVisible: false,
      lastActivityAt: new Date().toISOString()
    })

    // Add to presence map
    if (!onlineUsers.has(user.id)) {
      onlineUsers.set(user.id, new Set())
    }
    onlineUsers.get(user.id).add(connection)

    // First connection = just came online
    if (onlineUsers.get(user.id).size === 1) {
      clearAutoAwayState(user.id)

      try {
        // Use service.patch (triggers 'users patched' event -> allUsers sync)
        await app.service('users').patch(user.id, { status: 'online' })
      } catch (error) {
        logger.error('Fehler beim Status-Update auf online:', { error: error.message })
      }

      // Broadcast presence change (updates onlineUserIds on clients)
      app.channel('authenticated').send({
        type: 'presence',
        userId: user.id,
        status: 'online'
      })

      logger.info(`${user.display_name} ist jetzt online`)
    }
  })

  app.on('disconnect', (connection) => {
    if (!connection) return

    const userId = connectionToUser.get(connection)
    if (!userId) return

    // Clean up mappings
    connectionToUser.delete(connection)
    clearConnectionForegroundState(connection)

    const connections = onlineUsers.get(userId)
    if (connections) {
      connections.delete(connection)

      // Last connection gone -> start grace period
      if (connections.size === 0) {
        onlineUsers.delete(userId)

        const timer = setTimeout(async () => {
          disconnectTimers.delete(userId)

          // Double-check they haven't reconnected
          if (!onlineUsers.has(userId)) {
            clearAutoAwayState(userId)

            try {
              // Use service.patch (triggers 'users patched' event -> allUsers sync)
              await app.service('users').patch(userId, { status: 'offline' })
            } catch (error) {
              logger.error('Fehler beim Status-Update auf offline:', { error: error.message })
            }

            // Remove from voice channel if connected
            try {
              await removeVoiceParticipant(app, userId)
            } catch (error) {
              logger.error('Fehler beim Voice-Cleanup:', { error: error.message })
            }

            app.channel('authenticated').send({
              type: 'presence',
              userId,
              status: 'offline'
            })

            logger.info(`User ${userId} ist jetzt offline`)
          }
        }, DISCONNECT_GRACE_MS)

        disconnectTimers.set(userId, timer)
      }
    }
  })
}

// Clean up stale online status after server restart
export async function cleanupStalePresence(app) {
  try {
    const db = app.get('postgresqlClient')
    const updated = await db('users')
      .whereIn('status', ['online', 'away'])
      .update({ status: 'offline', updated_at: new Date().toISOString() })

    if (updated > 0) {
      logger.info(`${updated} User-Status auf offline zurueckgesetzt (Server-Neustart)`)
    }
  } catch (error) {
    logger.error('Fehler beim Presence-Cleanup:', { error: error.message })
  }
}

export function resetPresenceStateForTests() {
  for (const timer of disconnectTimers.values()) {
    clearTimeout(timer)
  }

  onlineUsers.clear()
  connectionToUser.clear()
  connectionForegroundState.clear()
  disconnectTimers.clear()
  autoAwayUsers.clear()
}
