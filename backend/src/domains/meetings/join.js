import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { snapshotMeetingStartMembers } from './content-access.js'

export async function join({ repository, reads, authorization, effects, getNow, createId }, id, data, params) {
  const user = params.user
  const normalized = await reads._getNormalizedMeetingOrThrow(id)
  if (normalized.status === 'ended' || normalized.status === 'cancelled') {
    throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
  }
  let meeting
  let activated = false

  await repository.transaction(async (trx) => {
    meeting = await repository.joinLockMeeting({ trx, id })
    if (!meeting) throw notFound('api.meetings.meeting_not_found', {}, 'Meeting nicht gefunden')
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
    }
    const nowIso = getNow().toISOString()
    let participant = await repository.joinFindMeetingParticipant({ trx, id, userId: user.id })
    if (!participant && !user.is_admin) {
      if (meeting.status !== 'active' || !meeting.source_channel_id) {
        throw forbidden('api.meetings.meeting_access_denied', {}, 'Kein Zugriff auf dieses Meeting')
      }
      await authorization._assertCanUseSourceChannel(meeting.source_channel_id, user, trx)
    }
    const isHostOrAdmin = user.is_admin || meeting.host_user_id === user.id
    if (meeting.status === 'scheduled' && !isHostOrAdmin) {
      const joinNotBefore = meeting.join_not_before ? new Date(meeting.join_not_before) : null
      if (joinNotBefore && !Number.isNaN(joinNotBefore.getTime()) && joinNotBefore.toISOString() > nowIso) {
        throw badRequest(
          'api.meetings.join_not_open_yet',
          { join_not_before: meeting.join_not_before },
          'Dieses Meeting ist noch nicht zum Beitritt freigegeben'
        )
      }
    }
    if (!participant) {
      participant = {
        id: createId(),
        meeting_id: id,
        user_id: user.id,
        role: 'participant',
        invite_status: 'joined',
        invited_at: nowIso,
        joined_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      }
      await repository.joinInsertMeetingParticipants({ trx, participant })
    } else {
      await repository.joinUpdateMeetingParticipants({ trx, participant, nowIso })
    }

    if (meeting.status === 'scheduled') {
      await repository.joinUpdateMeetings({ trx, id, nowIso })

      await snapshotMeetingStartMembers(trx, {
        meetingId: id,
        sourceChannelId: meeting.source_channel_id,
        nowIso
      })
      activated = true
    }

    await repository.joinInsertChannelMembers({ trx, createId, meeting, user, nowIso })
  }, { isolationLevel: 'read committed' })

  if (activated) effects._queueSourceMessage(id)

  effects._joinConnectionsToChannel(meeting.chat_channel_id, [user.id])

  const voice = await effects.voiceCreate(
    { channel_id: meeting.chat_channel_id },
    {
      ...params,
      user,
      provider: params.provider
    }
  )

  if (data?.muted || data?.deafened) {
    await effects.voicePatch(
      meeting.chat_channel_id,
      {
        ...(data?.muted ? { is_muted: true } : {}),
        ...(data?.deafened ? { is_deafened: true } : {})
      },
      {
        ...params,
        user,
        provider: params.provider
      }
    )
  }

  effects.emitMeeting('joined', {
    meetingId: id,
    chatChannelId: meeting.chat_channel_id,
    userId: user.id,
    participantUserId: user.id,
    status: 'active'
  })

  return {
    meeting: await reads.get(id, params),
    voice
  }
}
