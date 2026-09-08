import { createId } from '@paralleldrive/cuid2'
import { logger } from '../../logger.js'
import { assertReminderAccess, isReminderAccessDenied } from './access.js'

export async function processDueMessageReminders(app, {
  now,
  clock = () => new Date(),
  limit = 100,
  generateId = createId,
  log = logger
} = {}) {
  const db = app.get('postgresqlClient')
  const currentTime = () => now === undefined ? clock() : now
  const dueReminders = await db('message_reminders')
    .where('status', 'active')
    .where('remind_at', '<=', currentTime().toISOString())
    .orderBy('remind_at', 'asc').orderBy('id', 'asc').limit(limit).select('id')
  let delivered = 0
  let skipped = 0

  for (const candidate of dueReminders) {
    let outcome
    try {
      outcome = await db.transaction(async (trx) => {
        const reminder = await trx('message_reminders').where('id', candidate.id)
          .forUpdate().skipLocked().first()
        const processingTime = currentTime()
        const timestamp = processingTime.toISOString()
        if (!reminder || reminder.status !== 'active' || new Date(reminder.remind_at) > processingTime) return null
        let access
        try {
          access = await assertReminderAccess(trx, {
            messageId: reminder.message_id, userId: reminder.user_id, now: processingTime
          })
        } catch (error) {
          if (!isReminderAccessDenied(error)) throw error
          await trx('message_reminders').where('id', reminder.id).update({
            status: 'cancelled', cancelled_at: timestamp, updated_at: timestamp
          })
          return { cancelled: true }
        }
        const notification = {
          id: generateId(), user_id: reminder.user_id, type: 'message_reminder',
          message_id: access.message.id, channel_id: access.message.channel_id,
          actor_id: null,
          actor_display_name: access.user.preferred_locale === 'de' ? 'Erinnerung' : 'Reminder',
          message_snippet: (access.message.content || '').slice(0, 120),
          is_read: false, created_at: timestamp, meeting_id: null
        }
        await trx('notifications').insert(notification)
        await trx('message_reminders').where('id', reminder.id).update({
          status: 'delivered', notification_id: notification.id,
          delivered_at: timestamp, updated_at: timestamp
        })
        return { notification }
      })
    } catch (error) {
      log.error('Message reminder processing failed', { reminderId: candidate.id, error: error.message })
      continue
    }
    if (outcome?.cancelled) skipped++
    if (outcome?.notification) {
      delivered++
      // Commit is complete. Best-effort dispatch must never reset database state.
      try {
        await app.get('notificationSideEffectsDispatcher')?.enqueue([outcome.notification])
      } catch (error) {
        log.error('Message reminder dispatch failed', { reminderId: candidate.id, error: error.message })
      }
    }
  }
  return { processed: dueReminders.length, delivered, skipped }
}
