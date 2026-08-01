import { createId } from '@paralleldrive/cuid2'
import { logger } from '../logger.js'

function buildNotificationRow({
  userId,
  type,
  message,
  actor,
  snippet,
  now
}) {
  return {
    id: createId(),
    user_id: userId,
    type,
    message_id: message.id,
    channel_id: message.channel_id,
    actor_id: actor.id,
    actor_display_name: actor.display_name,
    message_snippet: snippet,
    is_read: false,
    created_at: now
  }
}

export async function buildNotificationsToInsert(context) {
  const db = context.app.get('postgresqlClient')
  const message = context.result
  const actor = context.params.user
  const now = new Date().toISOString()

  const channel = await db('channels').where('id', message.channel_id).first()
  const mentions = Array.isArray(message.mentions)
    ? message.mentions
    : await db('mentions').where('message_id', message.id)

  const isDm = channel && (channel.type === 'dm' || channel.type === 'group')
  if (mentions.length === 0 && !isDm) return []

  const snippet = (message.content || '').slice(0, 120)
  const notificationsToInsert = []
  const queuedUserIds = new Set()

  const queueNotification = (userId, type) => {
    if (!userId || queuedUserIds.has(userId)) return
    queuedUserIds.add(userId)
    notificationsToInsert.push(buildNotificationRow({
      userId,
      type,
      message,
      actor,
      snippet,
      now
    }))
  }

  const hasUserMentions = mentions.some((entry) => entry.type === 'user')
  const hasBroadcastMention = mentions.some((entry) => entry.type === 'all' || entry.type === 'channel')

  if (hasUserMentions) {
    const userMentionIds = [...new Set(
      mentions
        .filter((entry) => entry.type === 'user' && entry.user_id !== actor.id)
        .map((entry) => entry.user_id)
        .filter(Boolean)
    )]

    if (userMentionIds.length > 0) {
      const memberships = await db('channel_members')
        .whereIn('user_id', userMentionIds)
        .where('channel_id', message.channel_id)
        .select('user_id', 'notifications')

      const prefByUser = {}
      for (const membership of memberships) {
        prefByUser[membership.user_id] = membership.notifications
      }

      for (const userId of userMentionIds) {
        const pref = prefByUser[userId] || 'all'
        if (pref === 'none') continue
        queueNotification(userId, 'mention')
      }
    }
  }

  if (hasBroadcastMention) {
    const allMembers = await db('channel_members')
      .where('channel_id', message.channel_id)
      .whereNot('user_id', actor.id)
      .whereNot('notifications', 'none')
      .select('user_id')

    for (const member of allMembers) {
      queueNotification(member.user_id, 'mention_all')
    }
  }

  if (isDm) {
    const dmMembers = await db('channel_members')
      .where('channel_id', message.channel_id)
      .whereNot('user_id', actor.id)
      .whereNot('notifications', 'none')
      .select('user_id')

    for (const member of dmMembers) {
      queueNotification(member.user_id, 'dm_message')
    }
  }

  return notificationsToInsert
}

export const createNotifications = async (context) => {
  try {
    if (context.params?.skipNotifications) {
      return context
    }

    const db = context.app.get('postgresqlClient')
    const notificationsToInsert = await buildNotificationsToInsert(context)
    if (notificationsToInsert.length === 0) return context

    await db('notifications').insert(notificationsToInsert)
    logger.info(`Created ${notificationsToInsert.length} notification(s) for message ${context.result.id}`)

    const dispatcher = context.app.get('notificationSideEffectsDispatcher')
    dispatcher?.enqueue(notificationsToInsert)
  } catch (error) {
    logger.error('create-notifications hook failed', { error: error.message, stack: error.stack })
  }

  return context
}
