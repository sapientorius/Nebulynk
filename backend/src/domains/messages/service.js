import { createId } from '@paralleldrive/cuid2'
import {
  assertChannelIdForFind,
  assertMessageExists,
  assertReplyBelongsToChannel,
  assertChannelIsWritable,
  shouldSkipSendPermissionCheck,
  requiresManageMessagesPermission,
  withChannelQuery,
  withEditedAt
} from './policy.js'

export class MessagesDomainService {
  constructor({ repository, now = () => new Date() }) {
    this.repository = repository
    this.now = now
  }

  assertFindAccess(query) {
    assertChannelIdForFind(query)
  }

  async resolveCreateAccess(channelId) {
    const channel = channelId
      ? await this.repository.findChannelById(channelId)
      : null

    assertChannelIsWritable(channel)

    return {
      skipSendPermissionCheck: shouldSkipSendPermissionCheck(channel)
    }
  }

  prepareCreateData(rawData) {
    const data = { ...(rawData || {}) }
    const fileIds = data.file_ids
    delete data.file_ids

    return {
      data: {
        ...data,
        id: createId(),
        type: fileIds && fileIds.length > 0 ? 'file' : (data.type || 'text')
      },
      fileIds
    }
  }

  async resolveReplyAccess({ channelId, replyToMessageId }) {
    if (!replyToMessageId) return null

    const replyMessage = await this.repository.findMessageById(replyToMessageId)
    assertMessageExists(replyMessage)
    assertReplyBelongsToChannel(replyMessage, channelId)
    return replyMessage
  }

  async resolveMutationAccess({ messageId, currentUserId, currentQuery }) {
    const message = await this.repository.findMessageById(messageId)
    assertMessageExists(message)

    return {
      message,
      query: withChannelQuery(currentQuery, message.channel_id),
      requiresManagePermission: requiresManageMessagesPermission(message, currentUserId)
    }
  }

  addEditedAt(patchData) {
    return withEditedAt(patchData, this.now().toISOString())
  }

  async softDelete(messageId, deletedAtIso) {
    await this.repository.softDeleteMessage(messageId, deletedAtIso)
  }

  buildSoftDeleteResult(message, deletedAtIso) {
    return {
      ...message,
      deleted_at: deletedAtIso
    }
  }
}
