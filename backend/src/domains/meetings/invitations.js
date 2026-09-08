import { badRequest, forbidden } from '../../lib/errors.js'
import { buildMeetingInviteUrl, createMeetingInviteToken, hashMeetingInviteToken } from '../../lib/meeting-invites.js'
import { assertCanManageMeeting } from './policy.js'
import { resolveFrontendUrl } from '../../lib/security-config.js'

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

export async function invite({ repository, reads, authorization, effects, getNow, createId }, id, data, params) {
  const user = params.user
  const userIds = uniqueIds(data.user_ids).filter((userId) => userId !== user.id)

  if (userIds.length === 0) {
    return reads.get(id, params)
  }

  await authorization._assertUsersExist(userIds)

  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user)
  await authorization._assertCanInviteToMeeting(meeting, user)

  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
  }

  const nowIso = getNow().toISOString()
  let invitedUserIds = []
  let notificationRows = []

  await repository.transaction(async (trx) => {
    const existingRows = await repository.inviteFindMeetingParticipants({ trx, id, userIds })

    const existingByUser = new Map(existingRows.map((row) => [row.user_id, row]))
    const reInvites = existingRows
      .filter((row) => row.invite_status === 'left' || row.invite_status === 'declined')
      .map((row) => row.user_id)
    const newInvites = userIds.filter((candidateId) => !existingByUser.has(candidateId))

    invitedUserIds = [...reInvites, ...newInvites]

    if (reInvites.length > 0) {
      await repository.inviteUpdateMeetingParticipants({ trx, id, reInvites, nowIso })
    }

    if (newInvites.length > 0) {
      const participantRows = newInvites.map((participantId) => ({
        id: createId(),
        meeting_id: id,
        user_id: participantId,
        role: 'participant',
        invite_status: 'invited',
        invited_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      }))
      await repository.inviteInsertMeetingParticipants({ trx, participantRows })
    }

    if (invitedUserIds.length === 0) {
      notificationRows = []
      return
    }

    const channelMemberRows = invitedUserIds.map((participantId) => ({
      id: createId(),
      channel_id: meeting.chat_channel_id,
      user_id: participantId,
      role: 'member',
      created_at: nowIso,
      updated_at: nowIso
    }))

    await repository.inviteInsertChannelMembers({ trx, channelMemberRows })

    const notificationText = `Meeting invite: /meetings/${id}`
    notificationRows = invitedUserIds.map((inviteeId) => ({
      id: createId(),
      user_id: inviteeId,
      type: 'meeting_invite',
      meeting_id: id,
      message_id: null,
      channel_id: meeting.source_channel_id,
      actor_id: user.id,
      actor_display_name: user.display_name,
      message_snippet: notificationText,
      is_read: false,
      created_at: nowIso
    }))

    await repository.inviteInsertNotifications({ trx, notificationRows })
  })

  if (invitedUserIds.length > 0) {
    const sourceChannelDisplayName = await reads._resolveSourceChannelDisplayName({
      sourceChannelId: meeting.source_channel_id,
      sourceChannelType: meeting.source_channel_type,
      sourceChannelName: meeting.source_channel_name,
      viewerUserId: null
    })

    effects._joinConnectionsToChannel(meeting.chat_channel_id, invitedUserIds)
    effects._emitNotificationEvents(notificationRows)
    effects.emitMeeting('invited', {
      meetingId: id,
      chatChannelId: meeting.chat_channel_id,
      sourceChannelId: meeting.source_channel_id,
      sourceChannelName: meeting.source_channel_name || null,
      sourceChannelDisplayName: sourceChannelDisplayName || null,
      meetingTitle: meeting.title || null,
      meetingStatus: meeting.status,
      userIds: invitedUserIds,
      invitedBy: user.id
    })
  }

  return reads.get(id, params)
}

export async function decline({ repository, reads, authorization, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)

  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    return reads.get(id, params)
  }

  const participant = await reads._getMeetingParticipant(id, user.id)
  if (!participant) {
    throw forbidden(
      'api.meetings.decline_only_invited_allowed',
      {},
      'Nur eingeladene Teilnehmer koennen den Anruf ablehnen'
    )
  }

  if (participant.invite_status === 'joined') {
    throw badRequest('api.meetings.participant_already_joined', {}, 'Teilnehmer ist bereits beigetreten')
  }

  const nowIso = getNow().toISOString()
  await repository.declineUpdateMeetingParticipants({ participant, nowIso })

  return reads.get(id, params)
}

export async function createInviteLink({ repository, reads, authorization, getNow, createId }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.invite_link_forbidden',
    message: 'Nur Host oder Admin kann Gast-Links verwalten'
  })

  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    throw badRequest('api.meetings.meeting_already_ended', {}, 'Meeting ist bereits beendet')
  }

  const nowIso = getNow().toISOString()
  const expiresAt = normalizeDateTime(data?.expires_at, '/expires_at')
    || meeting.scheduled_end_at
    || null
  const token = createMeetingInviteToken()
  const tokenHash = hashMeetingInviteToken(token)
  const linkId = createId()

  await repository.transaction(async (trx) => {
    await repository.createInviteLinkUpdateMeetingInviteLinks({ trx, id, nowIso })

    await repository.createInviteLinkInsertMeetingInviteLinks({ trx, linkId, id, tokenHash, user, expiresAt, nowIso })
  })

  const result = await reads.get(id, params)
  result.guest_invite_link = {
    ...(result.guest_invite_link || {}),
    id: linkId,
      expires_at: expiresAt,
      created_at: nowIso,
      join_url: buildMeetingInviteUrl({
        frontendUrl: resolveFrontendUrl(process.env),
        token
      })
    }
  return result
}

export async function revokeInviteLink({ repository, reads, authorization, getNow }, id, data, params) {
  const user = params.user
  const meeting = await reads._getNormalizedMeetingOrThrow(id)
  await authorization._assertCanAccessMeeting(id, user, meeting)
  assertCanManageMeeting({
    meeting,
    user,
    code: 'api.meetings.invite_link_forbidden',
    message: 'Nur Host oder Admin kann Gast-Links verwalten'
  })

  const linkId = typeof data?.link_id === 'string' ? data.link_id.trim() : null
  const nowIso = getNow().toISOString()
  const query = repository.revokeInviteLinkFindMeetingInviteLinks({ id })

  if (linkId) {
    query.where('id', linkId)
  }

  await query.update({
    revoked_at: nowIso,
    updated_at: nowIso
  })

  return reads.get(id, params)
}
