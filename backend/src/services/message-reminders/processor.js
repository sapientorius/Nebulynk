import { createId } from '@paralleldrive/cuid2'
import { logger } from '../../logger.js'

function reminderNotificationTitle(user) {
  return user?.preferred_locale === 'de' ? 'Erinnerung' : 'Reminder'
}

async function canReadMessage(db, reminder) {
  const message = await db('messages')
    .where('id', reminder.message_id)
    .whereNull('deleted_at')
    .first()

  if (!message) return null

  const user = await db('users').where('id', reminder.user_id).first()
  if (!user) return null
  if (user.is_admin) return { message, user }

  const membership = await db('channel_members')
    .where({ channel_id: message.channel_id, user_id: reminder.user_id })
    .first()

  if (!membership) return null
  return { message, user }
}

export async function processDueMessageReminders(app, {
  now = new Date(),
  limit = 100,
  generateId = createId,
  log = logger
} = {}) {
  const db = app.get('postgresqlClient')
  const nowIso = now.toISOString()

  const dueReminders = await db('message_reminders')
    .where('status', 'active')
    .where('remind_at', '<=', nowIso)
    .orderBy('remind_at', 'asc')
    .limit(limit)

  if (dueReminders.length === 0) {
    return { processed: 0, delivered: 0, skipped: 0 }
  }

  const deliveredNotifications = []
  let delivered = 0
  let skipped = 0

  for (const reminder of dueReminders) {
    const processingAt = new Date().toISOString()
    const claimed = await db('message_reminders')
      .where({ id: reminder.id, status: 'active' })
      .update({ status: 'processing', updated_at: processingAt })

    if (claimed === 0) continue

    try {
      const access = await canReadMessage(db, reminder)
      if (!access) {
        await db('message_reminders')
          .where('id', reminder.id)
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        skipped++
        continue
      }

      const notification = {
        id: generateId(),
        user_id: reminder.user_id,
        type: 'message_reminder',
        message_id: access.message.id,
        channel_id: access.message.channel_id,
        actor_id: null,
        actor_display_name: reminderNotificationTitle(access.user),
        message_snippet: (access.message.content || '').slice(0, 120),
        is_read: false,
        created_at: new Date().toISOString(),
        meeting_id: null
      }

      await db('notifications').insert(notification)
      await db('message_reminders')
        .where('id', reminder.id)
        .update({
          status: 'delivered',
          notification_id: notification.id,
          delivered_at: notification.created_at,
          updated_at: notification.created_at
        })

      deliveredNotifications.push(notification)
      delivered++
    } catch (error) {
      await db('message_reminders')
        .where('id', reminder.id)
        .update({
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .catch(() => {})
      log.error('Message reminder processing failed', {
        reminderId: reminder.id,
        error: error.message
      })
    }
  }

  if (deliveredNotifications.length > 0) {
    app.get('notificationSideEffectsDispatcher')?.enqueue(deliveredNotifications)
  }

  return {
    processed: dueReminders.length,
    delivered,
    skipped
  }
}
