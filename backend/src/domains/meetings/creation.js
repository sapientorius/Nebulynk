import { badRequest } from '../../lib/errors.js'
import { snapshotMeetingStartMembers } from './content-access.js'

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter((id) => typeof id === 'string' && id.length > 0))]
}

function normalizeDateTime(value, fieldName) {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('api.validation.failed', {
      errors: [{ field: fieldName, message: 'must be date-time' }]
    }, 'Validierungsfehler')
  }
  return date.toISOString()
}

function buildDefaultJoinWindow(scheduledStartAt) {
  if (!scheduledStartAt) return null
  const date = new Date(scheduledStartAt)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() - (10 * 60 * 1000)).toISOString()
}

export async function create({ repository, reads, authorization, effects, getNow, createId }, data, params) {
  const user = params.user
  const userId = user.id
  const sourceChannelId = data.source_channel_id
  const requestedTitle = typeof data.title === 'string' ? data.title.trim() : null
  const requestedDescription = typeof data.description === 'string' ? data.description.trim() : null
  const requestedLanguage = reads._normalizeMeetingLanguageInput(data.language)
  const scheduledStartAt = normalizeDateTime(data.scheduled_start_at, '/scheduled_start_at')
  const scheduledEndAt = normalizeDateTime(data.scheduled_end_at, '/scheduled_end_at')
  const isScheduledMeeting = !!scheduledStartAt
  let inviteeIds = uniqueIds(data.initial_user_ids).filter((id) => id !== userId)

  if (scheduledEndAt && scheduledStartAt && scheduledEndAt <= scheduledStartAt) {
    throw badRequest(
      'api.meetings.invalid_schedule_window',
      {},
      'Das geplante Meeting-Ende muss nach dem Start liegen'
    )
  }

  const sourceChannel = await authorization._assertCanUseSourceChannel(sourceChannelId, user)
  const sourceChannelTopic = reads._normalizeLabel(sourceChannel.topic)
  const sourceChannelName = reads._normalizeLabel(sourceChannel.name)
  const sourceNameForDefaultTitle = (sourceChannel.type === 'dm' || sourceChannel.type === 'group')
    ? null
    : sourceChannelName
  const title = requestedTitle || sourceChannelTopic || sourceNameForDefaultTitle || null
  const sourceChannelDisplayName = await reads._resolveSourceChannelDisplayName({
    sourceChannelId,
    sourceChannelType: sourceChannel.type,
    sourceChannelName: sourceChannel.name,
    viewerUserId: null
  })

  if (!isScheduledMeeting) {
    const sourceMembers = await repository.createFindChannelMembers({ sourceChannelId, userId })

    inviteeIds = uniqueIds([
      ...inviteeIds,
      ...sourceMembers.map((member) => member.user_id)
    ])
  }

  if (inviteeIds.length > 0) {
    await authorization._assertUsersExist(inviteeIds)
  }

  const meetingLanguage = requestedLanguage || await reads._resolveDefaultMeetingLanguage()
  const nowIso = getNow().toISOString()
  const joinNotBefore = isScheduledMeeting
    ? buildDefaultJoinWindow(scheduledStartAt)
    : nowIso
  const initialStatus = isScheduledMeeting ? 'scheduled' : 'active'
  let meetingId = null
  let chatChannelId = null
  let allParticipantIds = []
  let notificationRows = []
  let created = false
  let reusedMeetingId = null

  await repository.transaction(async (trx) => {
    await repository.createLockChannels({ trx, sourceChannelId })

    if (!isScheduledMeeting) {
      const existingMeeting = await repository.createFindMeetings({ trx, sourceChannelId })

      if (existingMeeting) {
        reusedMeetingId = existingMeeting.id
        return
      }
    }

    created = true
    meetingId = createId()
    chatChannelId = createId()
    allParticipantIds = [userId, ...inviteeIds]

    await repository.createInsertChannels({ trx, chatChannelId, meetingId, title, userId, nowIso })

    await repository.createInsertMeetings({ trx, meetingId, title, requestedDescription, meetingLanguage, initialStatus, sourceChannelId, chatChannelId, userId, scheduledStartAt, scheduledEndAt, joinNotBefore, isScheduledMeeting, nowIso })

    const channelMemberRows = allParticipantIds.map((participantId) => ({
      id: createId(),
      channel_id: chatChannelId,
      user_id: participantId,
      role: participantId === userId ? 'owner' : 'member',
      created_at: nowIso,
      updated_at: nowIso
    }))

    await repository.createInsertChannelMembers({ trx, channelMemberRows })

    const participantRows = [
      {
        id: createId(),
        meeting_id: meetingId,
        user_id: userId,
        role: 'host',
        invite_status: isScheduledMeeting ? 'invited' : 'joined',
        invited_at: nowIso,
        joined_at: isScheduledMeeting ? null : nowIso,
        created_at: nowIso,
        updated_at: nowIso
      },
      ...inviteeIds.map((participantId) => ({
        id: createId(),
        meeting_id: meetingId,
        user_id: participantId,
        role: 'participant',
        invite_status: 'invited',
        invited_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      }))
    ]

    await repository.createInsertMeetingParticipants({ trx, participantRows })

    if (!isScheduledMeeting) {
      await snapshotMeetingStartMembers(trx, {
        meetingId,
        sourceChannelId,
        sourceChannelType: sourceChannel.type,
        nowIso
      })
    }

    if (inviteeIds.length === 0) {
      notificationRows = []
      return
    }

    const notificationText = `Meeting invite: /meetings/${meetingId}`
    notificationRows = inviteeIds.map((inviteeId) => ({
      id: createId(),
      user_id: inviteeId,
      type: 'meeting_invite',
      meeting_id: meetingId,
      message_id: null,
      channel_id: sourceChannel.id,
      actor_id: userId,
      actor_display_name: user.display_name,
      message_snippet: notificationText,
      is_read: false,
      created_at: nowIso
    }))

    await repository.createInsertNotifications({ trx, notificationRows })
  }, { isolationLevel: 'repeatable read' })

  if (!created && reusedMeetingId) {
    return reads.get(reusedMeetingId, params)
  }

  effects._joinConnectionsToChannel(chatChannelId, allParticipantIds)

  effects._emitNotificationEvents(notificationRows)

  if (inviteeIds.length > 0) {
    effects.emitMeeting('invited', {
      meetingId,
      chatChannelId,
      sourceChannelId,
      sourceChannelName: sourceChannel.name,
      sourceChannelDisplayName: sourceChannelDisplayName || null,
      meetingTitle: title,
      meetingStatus: initialStatus,
      userIds: inviteeIds,
      invitedBy: userId
    })
  }

  if (!isScheduledMeeting) {
    await effects._createSourceMessage({
      meetingId,
      sourceChannel,
      user
    })
  }

  return reads.get(meetingId, params)
}
