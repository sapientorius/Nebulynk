import { createId } from '@paralleldrive/cuid2'
import {
  isIncludeArchivedRequested,
  isDiscoverPublicRequested,
  normalizeIncludeArchived,
  withArchiveMetadata,
  assertChannelExists,
  assertMembershipDeleted
} from './policy.js'

export class ChannelsDomainService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository
    this.now = now
  }

  async resolveFindAccess({ provider, user, query }) {
    if (!provider || user?.is_admin) {
      return {
        includeArchived: isIncludeArchivedRequested(query?.include_archived),
        discoverPublic: false,
        accessibleChannelIds: []
      }
    }

    const discoverPublic = isDiscoverPublicRequested(query?.discover_public)
    const requestedIncludeArchived = discoverPublic
      ? false
      : isIncludeArchivedRequested(query?.include_archived)

    let canManageChannels = false
    if (requestedIncludeArchived) {
      const [hasPlatformManage, hasChannelManage] = await Promise.all([
        this.repository.hasPlatformManageChannelsPermission(user.id),
        this.repository.hasChannelManageChannelsPermission(user.id)
      ])
      canManageChannels = hasPlatformManage || hasChannelManage
    }

    return {
      includeArchived: normalizeIncludeArchived({
        requestedIncludeArchived,
        canManageChannels
      }),
      discoverPublic,
      accessibleChannelIds: await this.repository.findUserMembershipChannelIds(user.id)
    }
  }

  addArchiveMetadata(patchData, userId) {
    return withArchiveMetadata(patchData, userId, this.now().toISOString())
  }

  async joinChannel(channelId, userId) {
    const channel = await this.repository.findChannelById(channelId)
    assertChannelExists(channel)

    const existing = await this.repository.findMembership(channelId, userId)
    if (existing) return existing

    const member = {
      id: createId(),
      channel_id: channelId,
      user_id: userId,
      role: 'member'
    }

    await this.repository.addMembership(member)
    return member
  }

  async leaveChannel(channelId, userId) {
    const deleted = await this.repository.removeMembership(channelId, userId)
    assertMembershipDeleted(deleted)

    return { channelId, userId, left: true }
  }
}
