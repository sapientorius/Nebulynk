export class ChannelMembersRepository {
  constructor(db) {
    this.db = db
  }

  async findMembershipById(id) {
    return this.db('channel_members').where('id', id).first()
  }

  async findMembershipByChannelAndUser(channelId, userId) {
    return this.db('channel_members').where({ channel_id: channelId, user_id: userId }).first()
  }

  async findChannelById(channelId) {
    return this.db('channels')
      .where('id', channelId)
      .select('id', 'type', 'is_archived', 'purpose')
      .first()
  }
}
