export class MentionsRepository {
  constructor(db) {
    this.db = db
  }

  async findMessageById(messageId) {
    return this.db('messages')
      .where('id', messageId)
      .select('id', 'channel_id')
      .first()
  }

  async findChannelMembership(channelId, userId) {
    return this.db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .first()
  }

  async findMentions({ userId, messageId, limit }) {
    const query = this.db('mentions')
      .join('users as mentioned', function () {
        this.on('mentions.user_id', '=', 'mentioned.id')
      })
      .leftJoin('messages', 'mentions.message_id', '=', 'messages.id')

    if (userId) {
      query.where('mentions.user_id', userId)
    }

    if (messageId) {
      query.where('mentions.message_id', messageId)
    }

    query.select(
      'mentions.*',
      'mentioned.display_name as mentioned_display_name'
    )

    query.orderBy('mentions.created_at', 'desc').limit(limit)
    return query
  }
}
