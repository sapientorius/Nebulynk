import { assertCanAccessMeeting, assertCanInviteToMeeting, assertCanReadSourceChannel, assertCanUseSourceChannel, assertUsersExist } from './policy.js'

export async function _assertCanAccessMeeting({ reads }, meetingId, user, preloadedMeeting = null) {
  return assertCanAccessMeeting({
    meetingId,
    user,
    preloadedMeeting,
    findMeetingParticipant: (targetMeetingId, userId) => reads._getMeetingParticipant(targetMeetingId, userId),
    loadMeetingById: (targetMeetingId) => reads._getMeetingOrThrow(targetMeetingId)
  })
}

export async function _assertCanUseSourceChannel({ reads }, sourceChannelId, user) {
  return assertCanUseSourceChannel({
    sourceChannelId,
    user,
    findChannelById: (channelId) => reads._findChannelById(channelId),
    findChannelMembership: (channelId, userId) => reads._findChannelMembership(channelId, userId)
  })
}

export async function _assertCanReadSourceChannel({ reads }, sourceChannelId, user) {
  return assertCanReadSourceChannel({
    sourceChannelId,
    user,
    findChannelById: (channelId) => reads._findChannelById(channelId),
    findChannelMembership: (channelId, userId) => reads._findChannelMembership(channelId, userId)
  })
}

export async function _assertCanInviteToMeeting({ reads }, meeting, user) {
  return assertCanInviteToMeeting({
    meeting,
    user,
    findChannelById: (channelId) => reads._findChannelById(channelId)
  })
}

export async function _assertUsersExist({ reads }, userIds) {
  return assertUsersExist({
    userIds,
    findExistingUserIds: (targetUserIds) => reads._findExistingUserIds(targetUserIds)
  })
}
