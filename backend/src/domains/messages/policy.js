import { badRequest, notFound } from '../../lib/errors.js'

export function assertChannelIdForFind(query) {
  if (!query?.channel_id) {
    throw badRequest('api.messages.channel_id_required', {}, 'channel_id ist erforderlich')
  }
}

export function assertMessageExists(message) {
  if (!message) {
    throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
  }
}

export function assertReplyBelongsToChannel(replyMessage, channelId) {
  if (!replyMessage || replyMessage.channel_id !== channelId) {
    throw badRequest(
      'api.messages.reply_must_stay_in_channel',
      {},
      'Antworten muessen im selben Channel bleiben'
    )
  }
}

export function assertChannelIsWritable(channel) {
  if (channel?.is_archived) {
    throw badRequest('api.messages.channel_archived', {}, 'Channel ist archiviert')
  }
}

export function shouldSkipSendPermissionCheck(channel) {
  return channel?.type === 'dm' || channel?.type === 'group'
}

export function requiresManageMessagesPermission(message, currentUserId) {
  return message.user_id !== currentUserId
}

export function withChannelQuery(currentQuery, channelId) {
  return {
    ...(currentQuery || {}),
    channel_id: channelId
  }
}

export function withEditedAt(patchData, editedAtIso) {
  return {
    ...(patchData || {}),
    edited_at: editedAtIso
  }
}
