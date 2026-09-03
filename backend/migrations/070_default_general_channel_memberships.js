import { createId } from '@paralleldrive/cuid2'

const DEFAULT_CHANNEL_NAME = 'General'

export async function up(knex) {
  const defaultChannel = await knex('channels')
    .where({
      name: DEFAULT_CHANNEL_NAME,
      type: 'public',
      purpose: 'default',
      is_archived: false
    })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .first()

  if (!defaultChannel) return

  const [existingMemberships, eligibleUsers] = await Promise.all([
    knex('channel_members')
      .where('channel_id', defaultChannel.id)
      .select('user_id'),
    knex('users')
      .where({ account_type: 'member', registration_status: 'active' })
      .whereNull('disabled_at')
      .select('id')
  ])

  const memberIds = new Set(existingMemberships.map((membership) => membership.user_id))
  const missingMemberIds = eligibleUsers
    .map((user) => user.id)
    .filter((userId) => !memberIds.has(userId))

  if (missingMemberIds.length === 0) return

  await knex('channel_members').insert(missingMemberIds.map((userId) => ({
    id: createId(),
    channel_id: defaultChannel.id,
    user_id: userId,
    role: 'member'
  })))
}

export async function down() {
  // A data-only migration cannot safely distinguish later intentional memberships.
}
