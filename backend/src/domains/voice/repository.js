export class VoiceRepository {
  constructor(db) {
    this.db = db
  }

  async findChannelById(channelId) {
    return this.db('channels')
      .where('id', channelId)
      .select('id', 'name', 'type', 'purpose', 'is_voice', 'is_archived')
      .first()
  }

  async findVoiceParticipantByUserId(userId) {
    return this.db('voice_participants')
      .where('user_id', userId)
      .first()
  }

  async insertVoiceParticipant(participant) {
    await this.db('voice_participants').insert(participant)
  }

  async updateVoiceParticipant(channelId, userId, patchData) {
    return this.db('voice_participants')
      .where({ channel_id: channelId, user_id: userId })
      .update(patchData)
      .returning('*')
  }

  async deleteVoiceParticipant(channelId, userId) {
    return this.db('voice_participants')
      .where({ channel_id: channelId, user_id: userId })
      .del()
  }

  async deleteVoiceParticipantById(participantId) {
    return this.db('voice_participants').where('id', participantId).del()
  }

  async countVoiceParticipants(channelId) {
    return this.db('voice_participants')
      .where('channel_id', channelId)
      .count('* as count')
      .first()
  }

  async findChannelMembership(channelId, userId) {
    return this.db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .first()
  }

  async findMembershipChannelIds(userId) {
    const rows = await this.db('channel_members')
      .where('user_id', userId)
      .select('channel_id')

    return rows.map((row) => row.channel_id)
  }

  async insertChannelMembership(member) {
    await this.db('channel_members')
      .insert(member)
      .onConflict(['channel_id', 'user_id'])
      .ignore()
  }

  async findParticipantsByChannelId(channelId) {
    return this.db('voice_participants')
      .join('users', 'voice_participants.user_id', 'users.id')
      .select(
        'voice_participants.*',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )
      .where('voice_participants.channel_id', channelId)
  }

  async findParticipantsByChannelIds(channelIds) {
    return this.db('voice_participants')
      .join('users', 'voice_participants.user_id', 'users.id')
      .select(
        'voice_participants.*',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )
      .whereIn('voice_participants.channel_id', channelIds)
  }

  async findAllParticipants() {
    return this.db('voice_participants')
      .join('users', 'voice_participants.user_id', 'users.id')
      .select(
        'voice_participants.*',
        'users.display_name',
        'users.avatar_url',
        'users.status'
      )
  }
}
