import { createId } from '@paralleldrive/cuid2'
import { logger } from '../../logger.js'
import { upsertMessageSearchDocument } from '../../lib/search-index.js'
import { createMeetingRepository } from './repository.js'

export const SOURCE_MESSAGE_RETRY_MS = 30_000
export const SOURCE_MESSAGE_SWEEP_MS = 15_000

// Each attempt owns a separate commit boundary. A card failure cannot undo activation.
export async function processPendingMeetingSourceMessages(app, {
  meetingId = null,
  now = () => new Date(),
  limit = 50,
  generateId = createId,
  repository = createMeetingRepository(app.get('postgresqlClient')),
  indexMessage = upsertMessageSearchDocument,
  log = logger
} = {}) {
  const candidates = meetingId
    ? [{ id: meetingId }]
    : await repository.findDueSourceMessages({ nowIso: now().toISOString(), limit })
  const result = { processed: candidates.length, created: 0, skipped: 0, failed: 0 }

  for (const candidate of candidates) {
    let pendingMeeting
    let outcome
    try {
      outcome = await repository.transaction(async trx => {
        const meeting = await repository.lockPendingSourceMessage({ trx, id: candidate.id })
        if (!meeting?.source_message_pending_at || new Date(meeting.source_message_pending_at) > now()) return null
        pendingMeeting = meeting
        const clear = () => repository.clearSourceMessagePending({ trx, id: meeting.id })
        const skip = async reason => {
          await clear()
          return { reason }
        }
        if (!['active', 'ended'].includes(meeting.status) || !meeting.started_at) return skip('meeting_not_started')
        const channel = meeting.source_channel_id
          ? await repository.joinFindChannel({ trx, channelId: meeting.source_channel_id })
          : null
        if (!channel) return skip('source_channel_missing')
        if (channel.is_archived) return skip('source_channel_archived')

        const host = await repository.findSourceMessageHost({ trx, userId: meeting.host_user_id })
        const membership = host && !host.is_admin
          ? await repository.joinFindChannelMembership({ trx, channelId: channel.id, userId: host.id })
          : null
        if (!host || (!host.is_admin && !membership)) return skip('host_source_access_denied')

        const content = `[Meeting] /meetings/${meeting.id}`
        const existing = await repository.findSourceMessage({ trx, channelId: channel.id, content })
        if (existing) {
          await clear()
          return { existing: true }
        }
        const timestamp = new Date(meeting.started_at).toISOString()
        const [message] = await repository.insertSourceMessage({ trx, message: {
          id: generateId(), channel_id: channel.id, user_id: host.id, content, type: 'text',
          created_at: timestamp, updated_at: timestamp
        } })
        await indexMessage(trx, message.id)
        await clear()
        return { message: { ...message, user_display_name: host.display_name, user_avatar_url: host.avatar_url } }
      }, { isolationLevel: 'read committed' })
    } catch (error) {
      result.failed++
      log.warn('Failed to create scheduled meeting source message', {
        meetingId: candidate.id, sourceChannelId: pendingMeeting?.source_channel_id, error: error.message
      })
      // Compare the claimed value so a concurrent successful attempt is never requeued.
      if (pendingMeeting) {
        try {
          await repository.delaySourceMessage({
            id: candidate.id, pendingAt: pendingMeeting.source_message_pending_at,
            nextAt: new Date(now().getTime() + SOURCE_MESSAGE_RETRY_MS).toISOString()
          })
        } catch (retryError) {
          log.warn('Failed to delay meeting source message retry', {
            meetingId: candidate.id, sourceChannelId: pendingMeeting.source_channel_id, error: retryError.message
          })
        }
      }
      continue
    }
    if (outcome?.reason) {
      result.skipped++
      log.warn('Skipped scheduled meeting source message', {
        meetingId: candidate.id, sourceChannelId: pendingMeeting.source_channel_id, reason: outcome.reason
      })
    }
    if (outcome?.message) {
      result.created++
      try {
        // The existing publisher sends this only to channel/<sourceChannelId>.
        app.service('messages').emit('created', outcome.message)
      } catch (error) {
        log.warn('Failed to publish meeting source message', {
          meetingId: candidate.id, sourceChannelId: pendingMeeting.source_channel_id,
          messageId: outcome.message.id, error: error.message
        })
      }
    }
  }
  return result
}
