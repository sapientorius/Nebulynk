import {
  assertCanReadChannel,
  buildChannelReadAccessSql
} from '../meetings/content-access.js'

export class FilesRepository {
  constructor(db) {
    this.db = db
  }

  async findMessageById(messageId) {
    return this.db('messages').where('id', messageId).first()
  }

  async findFileById(fileId) {
    return this.db('files').where('id', fileId).first()
  }

  async findChannelMembership(channelId, userId) {
    return this.db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .first()
  }

  async assertCanReadChannel(channelId, user) {
    return assertCanReadChannel(this.db, { channelId, user })
  }

  async findFiles({ messageId, userId, limit, currentUserId, restrictToAccessibleScope }) {
    const query = this.db('files')

    if (messageId) {
      query.where('message_id', messageId)
    }

    if (userId) {
      query.where('user_id', userId)
    }

    if (restrictToAccessibleScope) {
      const db = this.db
      const channelAccess = buildChannelReadAccessSql('messages.channel_id', currentUserId)
      const readableMessageIds = db('messages')
        .select('messages.id')
        .whereRaw(channelAccess.sql, channelAccess.bindings)
      query.andWhere(function () {
        this.where(function () {
          this.where('files.user_id', currentUserId)
            .whereNull('files.message_id')
        })
          .orWhereIn('files.message_id', readableMessageIds)
      })
    }

    query.orderBy('created_at', 'desc').limit(limit)
    return query
  }

  async deleteFileById(fileId) {
    await this.db('files').where('id', fileId).delete()
  }
}
