import { createId } from '@paralleldrive/cuid2'
import { bt } from './i18n.js'
import { logger } from '../logger.js'
import { REGISTRATION_STATUS } from './self-registration.js'
import { hasUserPlatformPermission } from './user-permissions.js'

export const REGISTRATION_PENDING_REASON = Object.freeze({
  smtpUnavailable: 'smtp_unavailable',
  emailConfirmedAdminApproval: 'email_confirmed_admin_approval'
})

export const REGISTRATION_PENDING_NOTIFICATION_TYPE = 'registration_pending'
export const PENDING_REGISTRATION_SUMMARY_EVENT = 'pending-registration-summary updated'

function isActiveMember(user) {
  return user?.account_type === 'member'
    && !user.disabled_at
    && user.registration_status === REGISTRATION_STATUS.active
}

export async function listRegistrationManagers(app) {
  const db = app.get('postgresqlClient')
  const candidates = await db('users')
    .where('account_type', 'member')
    .whereNull('disabled_at')
    .where('registration_status', REGISTRATION_STATUS.active)
    .select('id', 'is_admin', 'preferred_locale', 'account_type', 'disabled_at', 'registration_status')

  const allowed = await Promise.all(candidates.map(async (user) => {
    if (!isActiveMember(user)) return null
    if (user.is_admin === true) return user

    const canManageUsers = await hasUserPlatformPermission(app, user.id, 'manage_users')
    return canManageUsers ? user : null
  }))

  return allowed.filter(Boolean)
}

export async function getPendingRegistrationAlertCount(db) {
  const rows = await db('users')
    .whereIn('registration_status', [
      REGISTRATION_STATUS.pendingEmailVerification,
      REGISTRATION_STATUS.pendingAdminApproval
    ])
    .whereIn('registration_pending_reason', Object.values(REGISTRATION_PENDING_REASON))
    .select('id')

  return rows.length
}

export async function broadcastPendingRegistrationSummary(app) {
  try {
    const db = app.get('postgresqlClient')
    const [count, managers] = await Promise.all([
      getPendingRegistrationAlertCount(db),
      listRegistrationManagers(app)
    ])

    for (const manager of managers) {
      app.channel?.(`user/${manager.id}`)?.send({
        type: PENDING_REGISTRATION_SUMMARY_EVENT,
        data: { count }
      })
    }

    return count
  } catch (error) {
    logger.error('Failed to broadcast pending registration summary', {
      error: error.message
    })
    return null
  }
}

export async function notifyRegistrationPending(app, registration) {
  try {
    if (!registration?.id) return []

    const db = app.get('postgresqlClient')
    const managers = await listRegistrationManagers(app)
    const now = new Date().toISOString()
    const actorName = registration.display_name || registration.email || 'New registration'
    const notifications = managers.map((manager) => ({
      id: createId(),
      user_id: manager.id,
      type: REGISTRATION_PENDING_NOTIFICATION_TYPE,
      message_id: null,
      channel_id: null,
      actor_id: registration.id,
      actor_display_name: actorName,
      message_snippet: bt(manager.preferred_locale, 'push.registrationPendingBody', { actor: actorName }),
      is_read: false,
      created_at: now
    }))

    if (notifications.length > 0) {
      await db('notifications').insert(notifications)
      app.get('notificationSideEffectsDispatcher')?.enqueue(notifications)
    }

    await broadcastPendingRegistrationSummary(app)
    return notifications
  } catch (error) {
    logger.error('Failed to notify registration managers', {
      registrationId: registration?.id || null,
      error: error.message
    })
    return []
  }
}
