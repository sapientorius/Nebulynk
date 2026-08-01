export class ChannelsRepository {
  constructor(db) {
    this.db = db
  }

  async findUserMembershipChannelIds(userId) {
    const memberships = await this.db('channel_members')
      .where('user_id', userId)
      .select('channel_id')
    return memberships.map((entry) => entry.channel_id)
  }

  async hasPlatformManageChannelsPermission(userId) {
    const row = await this.db('permissions')
      .join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
      .join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
      .where('user_roles.user_id', userId)
      .where('permissions.name', 'manage_channels')
      .first()

    return !!row
  }

  async hasChannelManageChannelsPermission(userId) {
    const row = await this.db('channel_members as cm')
      .join('roles', 'roles.name', '=', this.db.raw("CONCAT('channel:', cm.role)"))
      .join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
      .join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
      .where('cm.user_id', userId)
      .where('permissions.name', 'manage_channels')
      .first()

    return !!row
  }

  async findChannelById(channelId) {
    return this.db('channels').where('id', channelId).first()
  }

  async findMembership(channelId, userId) {
    return this.db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .first()
  }

  async addMembership(memberData) {
    await this.db('channel_members').insert(memberData)
  }

  async removeMembership(channelId, userId) {
    return this.db('channel_members')
      .where({ channel_id: channelId, user_id: userId })
      .del()
  }
}
