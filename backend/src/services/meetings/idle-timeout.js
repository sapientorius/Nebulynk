import { logger } from '../../logger.js'

export const IDLE_MEETING_TIMEOUT_MS = 10 * 60 * 1000
export const IDLE_MEETING_END_REASON = 'auto_end_idle_timeout'

function toIso(value) {
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

export async function markMeetingIdleByChatChannelId(app, chatChannelId, now = new Date()) {
  if (!chatChannelId) return false
  const db = app.get('postgresqlClient')
  const nowIso = toIso(now)
  const updated = await db('meetings')
    .where({
      chat_channel_id: chatChannelId,
      status: 'active'
    })
    .whereNull('empty_since')
    .update({
      empty_since: nowIso,
      updated_at: nowIso
    })

  return updated > 0
}

export async function clearMeetingIdleByChatChannelId(app, chatChannelId, now = new Date()) {
  if (!chatChannelId) return false
  const db = app.get('postgresqlClient')
  const nowIso = toIso(now)
  const updated = await db('meetings')
    .where({
      chat_channel_id: chatChannelId,
      status: 'active'
    })
    .whereNotNull('empty_since')
    .update({
      empty_since: null,
      updated_at: nowIso
    })

  return updated > 0
}

async function countVoiceParticipants(db, channelId) {
  const row = await db('voice_participants')
    .where('channel_id', channelId)
    .count({ count: '*' })
    .first()
  return Number(row?.count || 0)
}

export async function endExpiredIdleMeetings(app, {
  now = new Date(),
  idleTimeoutMs = IDLE_MEETING_TIMEOUT_MS
} = {}) {
  const db = app.get('postgresqlClient')
  const nowDate = now instanceof Date ? now : new Date(now)
  const thresholdMs = nowDate.getTime() - idleTimeoutMs
  const thresholdIso = new Date(thresholdMs).toISOString()
  const candidates = await db('meetings')
    .where({ status: 'active' })
    .whereNotNull('empty_since')
    .where('empty_since', '<=', thresholdIso)
    .select('id', 'chat_channel_id', 'host_user_id', 'empty_since')

  let endedCount = 0
  let skippedByRace = 0

  for (const candidate of candidates) {
    const fresh = await db('meetings')
      .where({
        id: candidate.id,
        status: 'active'
      })
      .first()
    if (!fresh?.empty_since) {
      skippedByRace += 1
      continue
    }

    const freshEmptyMs = new Date(fresh.empty_since).getTime()
    if (Number.isNaN(freshEmptyMs) || freshEmptyMs > thresholdMs) {
      skippedByRace += 1
      continue
    }

    const voiceCount = await countVoiceParticipants(db, candidate.chat_channel_id)
    if (voiceCount > 0) {
      await clearMeetingIdleByChatChannelId(app, candidate.chat_channel_id, nowDate)
      skippedByRace += 1
      continue
    }

    try {
      await app.service('meetings').patch(
        candidate.id,
        {
          action: 'end',
          reason: IDLE_MEETING_END_REASON
        },
        {
          user: {
            id: candidate.host_user_id,
            is_admin: true
          }
        }
      )
      endedCount += 1
    } catch (error) {
      logger.warn('Failed to auto-end idle meeting', {
        meetingId: candidate.id,
        channelId: candidate.chat_channel_id,
        error: error.message
      })
    }
  }

  return {
    checkedCount: candidates.length,
    endedCount,
    skippedByRace
  }
}
