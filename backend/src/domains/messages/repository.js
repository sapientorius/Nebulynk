export class MessagesRepository {
  constructor(db) {
    this.db = db
  }

  async findChannelById(channelId, db = this.db) {
    return db('channels').where('id', channelId).first()
  }

  async findMessageById(messageId, db = this.db) {
    return db('messages').where('id', messageId).first()
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

  async findMessagesByIdsWithAuthor(messageIds, db = this.db) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return []

    return db('messages')
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

  async claimUploads({ fileIds, userId, messageId, updatedAt }, db = this.db) {
    if (fileIds.length === 0) return []
    return db('files')
      .whereIn('id', fileIds)
      .where('user_id', userId)
      .whereNull('message_id')
      .update({ message_id: messageId, updated_at: updatedAt })
      .returning('*')
  }

  async deleteUnboundForwardFile(file) {
    return this.db('files')
      .where({ id: file.id, user_id: file.user_id, storage_key: file.storage_key, bucket: file.bucket })
      .whereNull('message_id')
      .delete()
      .returning('*')
  }

  async findFileById(fileId) {
    return this.db('files').where('id', fileId).first()
  }

  async softDeleteMessage(messageId, deletedAtIso) {
    await this.db('messages').where('id', messageId).update({ deleted_at: deletedAtIso })
  }
}
