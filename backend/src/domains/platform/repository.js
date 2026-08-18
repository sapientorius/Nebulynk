export class PlatformRepository {
  constructor(db) {
    this.db = db
  }

  async listSettings() {
    return this.db('platform_settings').select('*')
  }

  async findSetting(key) {
    return this.db('platform_settings').where('key', key).first()
  }

  async createChannel(channelData) {
    await this.db('channels').insert(channelData)
  }

  async createChannelMember(memberData) {
    await this.db('channel_members').insert(memberData)
  }

  async updateSetting(key, value) {
    const updated = await this.db('platform_settings').where('key', key).update({ value })
    if (!updated) {
      await this.db('platform_settings').insert({ key, value })
    }
  }

  async findSecret(key) {
    return this.db('platform_secrets').where('key', key).first()
  }

  async updateSecret(key, encryptedValue) {
    const now = new Date().toISOString()
    const updated = await this.db('platform_secrets')
      .where('key', key)
      .update({ encrypted_value: encryptedValue, updated_at: now })

    if (!updated) {
      await this.db('platform_secrets').insert({
        key,
        encrypted_value: encryptedValue,
        created_at: now,
        updated_at: now
      })
    }
  }

  async deleteSecret(key) {
    await this.db('platform_secrets').where('key', key).delete()
  }

  async deleteUserById(userId) {
    await this.db('users').where('id', userId).delete()
  }

  async transaction(runInTransaction) {
    await this.db.transaction(async (trx) => {
      const trxRepository = new PlatformRepository(trx)
      await runInTransaction(trxRepository)
    })
  }
}
