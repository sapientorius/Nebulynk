import { logger } from '../../logger.js'
import { MeetingArtifactsDomainService } from '../../domains/meetings/artifacts.js'
import {
  getOverdueScheduledMeetingEndedAt,
  isOverdueScheduledMeeting
} from '../../domains/meetings/lifecycle.js'

export const OVERDUE_SCHEDULED_MEETING_END_REASON = 'auto_end_scheduled_window_elapsed'

function pickActiveInviteLinksQuery(query) {
  return query.whereNull('revoked_at')
}

export async function autoEndOverdueScheduledMeeting({
  app,
  db,
  meeting,
  now = new Date(),
  artifactDomainService = new MeetingArtifactsDomainService({ db, app })
} = {}) {
  if (!app || !db || !meeting?.id || !isOverdueScheduledMeeting(meeting, now)) {
    return false
  }

  const nowDate = now instanceof Date ? now : new Date(now)
  const nowIso = nowDate.toISOString()
  const endedAtIso = getOverdueScheduledMeetingEndedAt(meeting)
  if (!endedAtIso) {
    return false
  }

  const freshMeeting = await db('meetings')
    .where({
      id: meeting.id,
      status: 'scheduled'
    })
    .first()

  if (!freshMeeting || !isOverdueScheduledMeeting(freshMeeting, nowDate)) {
    return false
  }

  const queuedArtifactTypesForEvent = await artifactDomainService.resolveEndedMeetingArtifactTypes(meeting.id)

  await db.transaction(async (trx) => {
    await trx('meetings')
      .where({
        id: meeting.id,
        status: 'scheduled'
      })
      .update({
        status: 'ended',
        ended_at: endedAtIso,
        ended_by: null,
        updated_at: nowIso
      })

    await trx('channels')
      .where('id', freshMeeting.chat_channel_id)
      .update({
        is_archived: true,
        archived_at: endedAtIso,
        archived_by: null,
        updated_at: nowIso
      })

    await pickActiveInviteLinksQuery(
      trx('meeting_invite_links').where('meeting_id', meeting.id)
    ).update({
      revoked_at: nowIso,
      updated_at: nowIso
    })

    if (queuedArtifactTypesForEvent.length > 0) {
      await artifactDomainService.queueProcessingArtifacts(trx, {
        meetingId: meeting.id,
        artifactTypes: queuedArtifactTypesForEvent,
        nowIso,
        resetPayload: true
      })
    }
  })

  const updatedChannel = await db('channels').where('id', freshMeeting.chat_channel_id).first()
  if (updatedChannel) {
    app.service('channels').emit('patched', updatedChannel)
  }

  app.service('meetings').emit('ended', {
    meetingId: meeting.id,
    chatChannelId: freshMeeting.chat_channel_id,
    endedAt: endedAtIso,
    endedBy: null,
    status: 'ended',
    chatChannelArchived: true,
    reason: OVERDUE_SCHEDULED_MEETING_END_REASON
  })

  artifactDomainService.emitArtifactsQueued({
    id: meeting.id,
    chat_channel_id: freshMeeting.chat_channel_id,
    source_channel_id: freshMeeting.source_channel_id
  }, {
    artifactTypes: queuedArtifactTypesForEvent,
    reason: OVERDUE_SCHEDULED_MEETING_END_REASON
  })

  return true
}

export async function endOverdueScheduledMeetings(app, {
  now = new Date(),
  artifactDomainService = null
} = {}) {
  const db = app.get('postgresqlClient')
  const nowDate = now instanceof Date ? now : new Date(now)
  const nowIso = nowDate.toISOString()
  const candidates = await db('meetings')
    .where({ status: 'scheduled' })
    .whereNotNull('scheduled_end_at')
    .where('scheduled_end_at', '<=', nowIso)
    .select('id', 'status', 'scheduled_end_at', 'chat_channel_id', 'source_channel_id')

  let endedCount = 0
  let skippedByRace = 0

  for (const candidate of candidates) {
    try {
      const ended = await autoEndOverdueScheduledMeeting({
        app,
        db,
        meeting: candidate,
        now: nowDate,
        artifactDomainService: artifactDomainService || undefined
      })

      if (ended) {
        endedCount += 1
      } else {
        skippedByRace += 1
      }
    } catch (error) {
      logger.warn('Failed to auto-end overdue scheduled meeting', {
        meetingId: candidate.id,
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
