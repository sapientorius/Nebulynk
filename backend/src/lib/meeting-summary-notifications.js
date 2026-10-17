import { createId } from '@paralleldrive/cuid2'
import { bt } from './i18n.js'

export async function buildMeetingSummaryNotifications(trx, meeting, nowIso) {
  const participants = await trx('meeting_participants')
    .where('meeting_id', meeting.id)
    .whereNotNull('joined_at')
    .select('user_id')
  const userIds = [...new Set(participants.map(participant => participant.user_id))]
  if (!userIds.length) return []
  const users = await trx('users').whereIn('id', userIds).select('id', 'preferred_locale')
  return users.map(user => ({
    id: createId(),
    user_id: user.id,
    type: 'meeting_summary_ready',
    meeting_id: meeting.id,
    channel_id: meeting.chat_channel_id,
    message_id: null,
    actor_id: null,
    actor_display_name: 'Nebulynk',
    message_snippet: bt(user.preferred_locale, 'push.summaryReadyBody', {
      title: meeting.title?.trim() || bt(user.preferred_locale, 'push.untitledMeeting')
    }),
    is_read: false,
    created_at: nowIso
  }))
}
