import { createId } from '@paralleldrive/cuid2'
import { isGuestAccount } from '../../lib/account-state.js'
import {
  isExternalNonAdmin,
  assertJoinVoicePermission,
  assertChannelExists,
  assertChannelIsVoice,
  assertChannelIsActive,
  assertChannelMembership,
  assertParticipantUpdateResult,
  shouldCleanupRoom
} from './policy.js'

export class VoiceDomainService {
  constructor({ repository, createIdFn = createId }) {
    this.repository = repository
    this.createIdFn = createIdFn
  }

  async findParticipants({ provider, user, query = {}, resolvePermissions }) {
    const isExternalMember = isExternalNonAdmin({ provider, user })
    const requiresJoinPermission = isExternalMember && !isGuestAccount(user)

    if (requiresJoinPermission) {
      const permissions = await resolvePermissions(user.id, query.channel_id || null)
      assertJoinVoicePermission(permissions.permissions.includes('join_voice_channels'))
    }

    if (query.channel_id) {
      if (isExternalMember) {
        const membership = await this.repository.findChannelMembership(query.channel_id, user.id)
        assertChannelMembership(membership)
      }
      return this.repository.findParticipantsByChannelId(query.channel_id)
    }

    if (isExternalMember) {
      const channelIds = await this.repository.findMembershipChannelIds(user.id)
      if (channelIds.length === 0) return []
      return this.repository.findParticipantsByChannelIds(channelIds)
    }

    return this.repository.findAllParticipants()
  }

  async resolveJoinChannel(channelId) {
    const channel = await this.repository.findChannelById(channelId)
    assertChannelExists(channel)
    assertChannelIsVoice(channel)
    assertChannelIsActive(channel)
    return channel
  }

  async findCurrentChannelForUser(userId) {
    const participant = await this.repository.findVoiceParticipantByUserId(userId)
    return participant?.channel_id || null
  }

  buildParticipant({ channelId, userId }) {
    return {
      id: this.createIdFn(),
      channel_id: channelId,
      user_id: userId,
      is_muted: false,
      is_deafened: false,
      is_video_enabled: false
    }
  }

  async addParticipant(participant) {
    await this.repository.insertVoiceParticipant(participant)
  }

  async listParticipantsByChannel(channelId) {
    return this.repository.findParticipantsByChannelId(channelId)
  }

  async leaveParticipant(channelId, userId) {
    const deleted = await this.repository.deleteVoiceParticipant(channelId, userId)
    if (!deleted) {
      return {
        left: false,
        channelId,
        userId,
        cleanupRoom: false
      }
    }

    const remaining = await this.repository.countVoiceParticipants(channelId)
    return {
      left: true,
      channelId,
      userId,
      cleanupRoom: shouldCleanupRoom(remaining)
    }
  }

  async updateParticipant(channelId, userId, patchData) {
    const updated = await this.repository.updateVoiceParticipant(channelId, userId, patchData)
    assertParticipantUpdateResult(updated)
    return updated[0]
  }

  async removeParticipantByUser(userId) {
    const participant = await this.repository.findVoiceParticipantByUserId(userId)
    if (!participant) return null

    await this.repository.deleteVoiceParticipantById(participant.id)

    const remaining = await this.repository.countVoiceParticipants(participant.channel_id)
    return {
      channelId: participant.channel_id,
      userId,
      cleanupRoom: shouldCleanupRoom(remaining)
    }
  }
}
