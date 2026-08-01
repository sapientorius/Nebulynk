export class MessagesRepository {
  constructor(db) {
    this.db = db
  }

  async findChannelById(channelId) {
    return this.db('channels').where('id', channelId).first()
  }

  async findMessageById(messageId) {
    return this.db('messages').where('id', messageId).first()
  }

  async findMessageByIdWithAuthor(messageId) {
    return this.db('messages')
      .leftJoin('users', 'messages.user_id', '=', 'users.id')
      .leftJoin('channels', 'messages.channel_id', '=', 'channels.id')
      .where('messages.id', messageId)
      .select(
        'messages.*',
        'users.display_name as user_display_name',
        'users.avatar_url as user_avatar_url',
        'channels.name as channel_name',
        'channels.type as channel_type',
        'channels.purpose as channel_purpose'
      )
      .first()
  }

  async findMessagesByIdsWithAuthor(messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return []

    return this.db('messages')
      .leftJoin('users', 'messages.user_id', '=', 'users.id')
      .leftJoin('channels', 'messages.channel_id', '=', 'channels.id')
      .whereIn('messages.id', messageIds)
      .select(
        'messages.*',
        'users.display_name as user_display_name',
        'users.avatar_url as user_avatar_url',
        'channels.name as channel_name',
        'channels.type as channel_type',
        'channels.purpose as channel_purpose'
      )
  }

  async findChannelMembership(channelId, userId) {
    return this.db('channel_members').where({ channel_id: channelId, user_id: userId }).first()
  }

  async findFilesByMessageId(messageId) {
    return this.db('files')
      .where('message_id', messageId)
      .select('*')
      .orderBy('created_at', 'asc')
  }

  async createFile(fileData) {
    await this.db('files').insert(fileData)
  }

  async deleteFilesByIds(fileIds) {
    if (!Array.isArray(fileIds) || fileIds.length === 0) return
    await this.db('files').whereIn('id', fileIds).delete()
  }

  async softDeleteMessage(messageId, deletedAtIso) {
    await this.db('messages').where('id', messageId).update({ deleted_at: deletedAtIso })
  }
}
