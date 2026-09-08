import { assertUserAccountActive } from '../../lib/account-state.js'
import { assertCanReadChannel } from '../../domains/meetings/content-access.js'
import { notFound } from '../../lib/errors.js'

// All reads use the caller's transaction, including the current account state.
export async function assertReminderAccess(db, { messageId, userId, now }) {
  const message = await db('messages').where('id', messageId).whereNull('deleted_at').first()
  if (!message) throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
  const user = await db('users').where('id', userId).first()
  assertUserAccountActive(user, now)
  await assertCanReadChannel(db, { channelId: message.channel_id, user })
  return { message, user }
}

export function isReminderAccessDenied(error) {
  return [
    'api.messages.message_not_found',
    'api.authentication.account_pending',
    'api.authentication.account_disabled',
    'api.channels.membership_required'
  ].includes(error?.data?.error_code)
}
