import { createId } from '@paralleldrive/cuid2'
import { badRequest } from '../../lib/errors.js'
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

  async resolveCreateAccess(channelId, db) {
    const channel = channelId
      ? await this.repository.findChannelById(channelId, db)
      : null

    assertChannelIsWritable(channel)

    return {
      skipSendPermissionCheck: shouldSkipSendPermissionCheck(channel)
    }
  }

  prepareCreateData(rawData) {
    const data = { ...(rawData || {}) }
    const fileIds = data.file_ids ? [...new Set(data.file_ids)] : []
    delete data.file_ids

    return {
      data: {
        ...data,
        ...(data.content === undefined && fileIds.length > 0 ? { content: '' } : {}),
        id: createId(),
        type: fileIds && fileIds.length > 0 ? 'file' : (data.type || 'text')
      },
      fileIds
    }
  }

  async attachFiles({ fileIds, userId, messageId }, db) {
    const files = await this.repository.claimUploads({
      fileIds, userId, messageId, updatedAt: this.now().toISOString()
    }, db)
    const byId = new Map(files.map((file) => [file.id, file]))
    if (byId.size !== fileIds.length || fileIds.some((id) => !byId.has(id))) {
      throw badRequest('api.messages.attachments_unavailable', {}, 'Mindestens eine Datei ist nicht verfügbar.')
    }
    return fileIds.map((id) => byId.get(id))
  }

  async resolveReplyAccess({ channelId, replyToMessageId }, db) {
    if (!replyToMessageId) return null

    const replyMessage = await this.repository.findMessageById(replyToMessageId, db)
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
