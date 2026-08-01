import { badRequest, forbidden, notFound } from '../../lib/errors.js'

export async function assertCanAccessMeeting({
  meetingId,
  user,
  preloadedMeeting = null,
  findMeetingParticipant,
  loadMeetingById
}) {
  if (user?.is_admin) return

  const participant = await findMeetingParticipant(meetingId, user?.id)
  if (participant) return

  await loadMeetingById(meetingId)

  throw forbidden('api.meetings.meeting_access_denied', {}, 'Kein Zugriff auf dieses Meeting')
}

export async function assertCanUseSourceChannel({
  sourceChannelId,
  user,
  findChannelById,
  findChannelMembership
}) {
  const sourceChannel = await findChannelById(sourceChannelId)
  if (!sourceChannel) {
    throw notFound('api.meetings.source_channel_not_found', {}, 'Start-Channel nicht gefunden')
  }

  if (sourceChannel.is_archived) {
    throw badRequest(
      'api.meetings.source_channel_archived',
      {},
      'Archivierter Channel kann kein Startkontext fuer Meetings sein'
    )
  }

  if (user?.is_admin) {
    return sourceChannel
  }

  const membership = await findChannelMembership(sourceChannelId, user?.id)
  if (!membership) {
    throw forbidden('api.meetings.source_channel_access_denied', {}, 'Kein Zugriff auf den Start-Channel')
  }

  return sourceChannel
}

export async function assertCanReadSourceChannel({
  sourceChannelId,
  user,
  findChannelById,
  findChannelMembership
}) {
  const sourceChannel = await findChannelById(sourceChannelId)
  if (!sourceChannel) {
    throw notFound('api.meetings.source_channel_not_found', {}, 'Start-Channel nicht gefunden')
  }

  if (user?.is_admin) {
    return sourceChannel
  }

  const membership = await findChannelMembership(sourceChannelId, user?.id)
  if (!membership) {
    throw forbidden('api.meetings.source_channel_access_denied', {}, 'Kein Zugriff auf den Start-Channel')
  }

  return sourceChannel
}

export async function assertCanInviteToMeeting({
  meeting,
  user,
  findChannelById
}) {
  if (user?.is_admin || meeting.host_user_id === user?.id) {
    return
  }

  const sourceChannel = await findChannelById(meeting.source_channel_id)
  if (!sourceChannel) {
    throw forbidden(
      'api.meetings.source_context_invalid',
      {},
      'Meeting hat keinen gueltigen Startkontext mehr'
    )
  }

  throw forbidden(
    'api.meetings.invite_forbidden',
    {},
    'Nur Host oder Admin duerfen weitere Teilnehmer einladen'
  )
}

export async function assertUsersExist({ userIds, findExistingUserIds }) {
  if (!userIds.length) return

  const existingUserIds = await findExistingUserIds(userIds)
  if (existingUserIds.length !== userIds.length) {
    throw badRequest('api.meetings.one_or_more_user_ids_invalid', {}, 'Eine oder mehrere User-IDs sind ungueltig')
  }
}

export function assertCanControlTranscriptionRecording({ meeting, user }) {
  if (user?.is_admin === true || meeting.host_user_id === user?.id) {
    return
  }

  throw forbidden(
    'api.meetings.transcription_recording_control_forbidden',
    {},
    'Nur Host oder Admin kann die Transkriptionsaufnahme steuern'
  )
}

export function assertCanManageMeeting({ meeting, user, code = 'api.meetings.manage_forbidden', message = 'Nur Host oder Admin darf dieses Meeting verwalten' }) {
  if (user?.is_admin === true || meeting?.host_user_id === user?.id) {
    return
  }

  throw forbidden(code, {}, message)
}
