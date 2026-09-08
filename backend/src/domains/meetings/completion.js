import { logger } from '../../logger.js'
import { badRequest } from '../../lib/errors.js'
import { assertCanManageMeeting } from './policy.js'

export async function end({ repository, reads, authorization, effects, artifacts, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)

  await authorization._assertCanAccessMeeting(id, user)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.end_forbidden',
    message: 'Nur Host oder Admin kann dieses Meeting beenden'
  })

  if (meeting.status === 'scheduled') {
    throw badRequest('api.meetings.end_only_active', {}, 'Geplante Meetings muessen abgesagt statt beendet werden')
  }

  if (meeting.status === 'ended') {
    return reads.get(id, params)
  }

  const nowIso = getNow().toISOString()
  const queuedArtifactTypesForEvent = await artifacts.resolveEndedMeetingArtifactTypes(id)

  await repository.transaction(async (trx) => {
    await repository.endUpdateMeetings({ trx, id, nowIso, user })

    await repository.endUpdateChannels({ trx, meeting, nowIso, user })

    await repository.endUpdateMeetingParticipants({ trx, id, nowIso })

    await repository.endUpdateMeetingRecordingPauses({ trx, id, user, nowIso })

    if (queuedArtifactTypesForEvent.length > 0) {
      await artifacts.queueProcessingArtifacts(trx, {
        meetingId: id,
        artifactTypes: queuedArtifactTypesForEvent,
        nowIso,
        resetPayload: true
      })
    }
  })

  await effects.stopRecordings({ meetingId: id })
  await repository.endDeleteVoiceParticipants({ meeting })

  try {
    await effects.removeRoom(meeting.chat_channel_id)
  } catch (error) {
    logger.warn('Meeting room cleanup failed', {
      meetingId: id,
      channelId: meeting.chat_channel_id,
      error: error.message
    })
  }

  const updatedChannel = await repository.endFindChannels({ meeting })
  if (updatedChannel) {
    effects.emitChannel('patched', updatedChannel)
  }

  effects.emitMeeting('ended', {
    meetingId: id,
    chatChannelId: meeting.chat_channel_id,
    endedAt: nowIso,
    endedBy: user.id,
    status: 'ended',
    chatChannelArchived: true
  })

  artifacts.emitArtifactsQueued(meeting, {
    artifactTypes: queuedArtifactTypesForEvent,
    reason: data?.reason || null
  })

  return reads.get(id, params)
}

export async function cancel({ repository, reads, authorization, effects, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.cancel_forbidden',
    message: 'Nur Host oder Admin kann dieses Meeting absagen'
  })

  if (meeting.status !== 'scheduled') {
    throw badRequest('api.meetings.cancel_only_scheduled', {}, 'Nur geplante Meetings koennen abgesagt werden')
  }

  const nowIso = getNow().toISOString()
  await repository.transaction(async (trx) => {
    await repository.cancelUpdateMeetings({ trx, id, nowIso })

    await repository.cancelUpdateChannels({ trx, meeting, nowIso, user })

    await repository.cancelUpdateMeetingInviteLinks({ trx, id, nowIso })
  })

  const updatedChannel = await repository.cancelFindChannels({ meeting })
  if (updatedChannel) {
    effects.emitChannel('patched', updatedChannel)
  }

  effects.emitMeeting('ended', {
    meetingId: id,
    chatChannelId: meeting.chat_channel_id,
    endedBy: user.id,
    status: 'cancelled',
    chatChannelArchived: true
  })

  return reads.get(id, params)
}
