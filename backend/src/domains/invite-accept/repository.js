import { createId } from '@paralleldrive/cuid2'
import { ensureDefaultChannelMembership as ensureDefaultChannelMembershipForUser } from '../../lib/default-channel-membership.js'

export class InviteAcceptRepository {
  constructor(db) {
    this.db = db
  }

  async findInviteForLookup(token) {
    return this.db('invites')
      .leftJoin('users', 'invites.invited_by', 'users.id')
      .where('invites.token', token)
      .select(
        'invites.id',
        'invites.email',
        'invites.status',
        'invites.message',
        'invites.expires_at',
        'invites.created_at',
        'users.display_name as invited_by_name'
      )
      .first()
  }

  async findPendingInvite(token) {
    return this.db('invites').where({ token, status: 'pending' }).first()
  }

  async findUserByEmail(email) {
    return this.db('users').where('email', email).first()
  }

  async markInviteExpired(inviteId, updatedAt) {
    await this.db('invites')
      .where('id', inviteId)
      .update({ status: 'expired', updated_at: updatedAt })
  }

  async markInviteAccepted(inviteId, acceptedBy, updatedAt) {
    await this.db('invites')
      .where('id', inviteId)
      .update({
        status: 'accepted',
        accepted_by: acceptedBy,
        updated_at: updatedAt
      })
  }

  async findRoleByName(roleName) {
    return this.db('roles').where('name', roleName).first()
  }

  async addUserRole(userId, roleId) {
    await this.db('user_roles').insert({
      id: createId(),
      user_id: userId,
      role_id: roleId
    })
  }

  async ensureDefaultChannelMembership(userId) {
    return ensureDefaultChannelMembershipForUser(this.db, userId)
  }

  async deleteUser(userId) {
    await this.db('users').where('id', userId).delete()
  }

  async getPlatformName() {
    const platform = await this.db('platform_settings').where('key', 'platform_name').first()
    return platform?.value || 'Nebulynk'
  }

  async getDefaultLocale() {
    const locale = await this.db('platform_settings').where('key', 'default_locale').first()
    return locale?.value || 'en'
  }

  async transaction(runInTransaction) {
    await this.db.transaction(async (trx) => {
      const trxRepository = new InviteAcceptRepository(trx)
      await runInTransaction(trxRepository)
    })
  }
}
