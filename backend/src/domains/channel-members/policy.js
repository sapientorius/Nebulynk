import { badRequest, forbidden, notFound } from '../../lib/errors.js'

export function assertChannelIdForFind({ user, query }) {
  if (!user?.is_admin && !query?.channel_id) {
    throw badRequest('api.channel_members.channel_id_required', {}, 'channel_id ist erforderlich')
  }
}

export function assertMembershipExists(membership) {
  if (!membership) {
    throw notFound('api.channel_members.membership_not_found', {}, 'Mitgliedschaft nicht gefunden')
  }
}

export function assertChannelExists(channel) {
  if (!channel) {
    throw notFound('api.channels.channel_not_found', {}, 'Channel nicht gefunden')
  }
}

export function assertSelfJoinAllowed(channel) {
  const isPublic = channel.type === 'public'
  const isActive = !channel.is_archived
  const isDefaultPurpose = !channel.purpose || channel.purpose === 'default'

  if (isPublic && isActive && isDefaultPurpose) {
    return
  }

  throw forbidden(
    'api.channels.self_join_public_only',
    { channel_id: channel.id },
    'Self-Join ist nur fuer aktive Public-Channels erlaubt'
  )
}

export function assertSelfLeaveAllowed(channel) {
  if (channel.type === 'public' || channel.type === 'private' || channel.type === 'group') {
    return
  }

  throw forbidden(
    'api.channels.self_leave_not_supported',
    { channel_id: channel.id, channel_type: channel.type },
    'Self-Leave wird fuer diesen Channel-Typ nicht unterstuetzt'
  )
}

export function assertMemberRemovalAllowed(channel) {
  if (channel.type !== 'dm') {
    return
  }

  throw forbidden(
    'api.channels.dm_member_removal_not_supported',
    { channel_id: channel.id, channel_type: channel.type },
    'Mitglieder koennen aus Direct Chats nicht entfernt werden'
  )
}

export function normalizeCreateRole(role, { forceMember = false } = {}) {
  if (forceMember) return 'member'
  return role || 'member'
}

export function requiresManagePermission({ targetMembership, currentUserId, patchData }) {
  if (patchData.role !== undefined) return true
  return targetMembership.user_id !== currentUserId
}

export function withPatchChannelQuery(currentQuery, targetMembership) {
  return {
    ...(currentQuery || {}),
    channel_id: targetMembership.channel_id
  }
}

export function withCreateChannelQuery(currentQuery, channelId) {
  return {
    ...(currentQuery || {}),
    channel_id: channelId
  }
}
