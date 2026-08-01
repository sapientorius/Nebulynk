import {
  assertChannelIdForFind,
  assertChannelExists,
  assertMembershipExists,
  assertSelfJoinAllowed,
  assertSelfLeaveAllowed,
  assertMemberRemovalAllowed,
  normalizeCreateRole,
  requiresManagePermission,
  withCreateChannelQuery,
  withPatchChannelQuery
} from './policy.js'

export class ChannelMembersDomainService {
  constructor({ repository }) {
    this.repository = repository
  }

  assertFindAccess({ user, query }) {
    assertChannelIdForFind({ user, query })
  }

  async resolveCreateAccess({ currentUserId, createData, currentQuery }) {
    const channelId = createData?.channel_id
    const targetUserId = createData?.user_id
    const channel = await this.repository.findChannelById(channelId)
    assertChannelExists(channel)
    const isSelfJoin = currentUserId && targetUserId === currentUserId

    const existingMembership = await this.repository.findMembershipByChannelAndUser(channelId, targetUserId)
    if (existingMembership) {
      return {
        query: withCreateChannelQuery(currentQuery, channelId),
        requiresManagePermission: !isSelfJoin,
        shortCircuitMembership: existingMembership,
        normalizedCreateData: null
      }
    }

    if (isSelfJoin) {
      assertSelfJoinAllowed(channel)
      return {
        query: withCreateChannelQuery(currentQuery, channelId),
        requiresManagePermission: false,
        shortCircuitMembership: null,
        normalizedCreateData: {
          ...createData,
          role: normalizeCreateRole(createData?.role, { forceMember: true })
        }
      }
    }

    return {
      query: withCreateChannelQuery(currentQuery, channelId),
      requiresManagePermission: true,
      shortCircuitMembership: null,
      normalizedCreateData: {
        ...createData,
        role: normalizeCreateRole(createData?.role)
      }
    }
  }

  async resolvePatchAccess({ membershipId, currentUserId, patchData, currentQuery }) {
    const membership = await this.repository.findMembershipById(membershipId)
    assertMembershipExists(membership)

    return {
      targetMembership: membership,
      query: withPatchChannelQuery(currentQuery, membership),
      requiresManagePermission: requiresManagePermission({
        targetMembership: membership,
        currentUserId,
        patchData
      })
    }
  }

  async resolveRemoveAccess({ membershipId, currentUserId, currentQuery }) {
    const membership = await this.repository.findMembershipById(membershipId)
    assertMembershipExists(membership)

    const channel = await this.repository.findChannelById(membership.channel_id)
    assertChannelExists(channel)
    assertMemberRemovalAllowed(channel)

    const isSelfLeave = membership.user_id === currentUserId
    if (isSelfLeave) {
      assertSelfLeaveAllowed(channel)
    }

    return {
      targetMembership: membership,
      query: withPatchChannelQuery(currentQuery, membership),
      requiresManagePermission: !isSelfLeave
    }
  }
}
