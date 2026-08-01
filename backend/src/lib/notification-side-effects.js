import { sendPushToUser } from '../services/push-subscriptions/push-subscriptions.js'
import { logger } from '../logger.js'
import { bt } from './i18n.js'
import { hasVisibleChannelSession } from '../presence.js'

function buildNotificationUrl(notification) {
  if (!notification?.channel_id) return '/channels'
  const channelId = encodeURIComponent(notification.channel_id)
  if (notification.message_id) {
    return `/channels/${channelId}?message=${encodeURIComponent(notification.message_id)}`
  }
  return `/channels/${channelId}`
}

function buildPushTitle(notification, user) {
  if (notification.type === 'message_reminder') {
    return bt(user?.preferred_locale, 'push.reminderTitle')
  }

  if (notification.type === 'dm_message') {
    return bt(user?.preferred_locale, 'push.dmTitle', { actor: notification.actor_display_name })
  }

  return bt(user?.preferred_locale, 'push.mentionTitle', { actor: notification.actor_display_name })
}

export function createNotificationSideEffectsDispatcher(app, {
  sendPush = sendPushToUser,
  hasVisibleSession = hasVisibleChannelSession,
  log = logger,
  schedule = (task) => queueMicrotask(task)
} = {}) {
  const queue = []
  let draining = false
  let scheduled = false

  async function processBatch(notifications = []) {
    if (!Array.isArray(notifications) || notifications.length === 0) return

    for (const notification of notifications) {
      try {
        app.service('notifications').emit('created', notification)
      } catch (error) {
        log.error('Failed to send notification via socket', {
          userId: notification.user_id,
          notificationId: notification.id,
          error: error.message
        })
      }
    }

    const recipientIds = [...new Set(
      notifications
        .map((notification) => notification.user_id)
        .filter(Boolean)
    )]
    if (recipientIds.length === 0) return

    const db = app.get('postgresqlClient')
    const users = await db('users')
      .whereIn('id', recipientIds)
      .select('id', 'status', 'preferred_locale')

    const userById = {}
    for (const user of users) {
      userById[user.id] = user
    }

    for (const notification of notifications) {
      const user = userById[notification.user_id]
      if (user?.status === 'dnd') continue
      if (notification.type !== 'message_reminder' && hasVisibleSession(notification.user_id, notification.channel_id)) continue

      const title = buildPushTitle(notification, user)

      try {
        await sendPush(app, notification.user_id, {
          title,
          body: notification.message_snippet,
          url: buildNotificationUrl(notification)
        })
      } catch (error) {
        log.error('Failed to send notification push', {
          userId: notification.user_id,
          notificationId: notification.id,
          error: error.message
        })
      }
    }
  }

  async function drain() {
    if (draining) return
    draining = true

    try {
      while (queue.length > 0) {
        const nextBatch = queue.shift()
        try {
          await processBatch(nextBatch)
        } catch (error) {
          log.error('Notification side-effect batch failed', {
            error: error.message,
            stack: error.stack
          })
        }
      }
    } finally {
      draining = false
      if (queue.length > 0) {
        scheduleDrain()
      }
    }
  }

  function scheduleDrain() {
    if (scheduled || draining) return
    scheduled = true
    schedule(() => {
      scheduled = false
      void drain()
    })
  }

  return {
    enqueue(notifications = []) {
      if (!Array.isArray(notifications) || notifications.length === 0) return
      queue.push(notifications.map((notification) => ({ ...notification })))
      scheduleDrain()
    },
    async flush() {
      await drain()
    },
    getPendingCount() {
      return queue.length
    }
  }
}
