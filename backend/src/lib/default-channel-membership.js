import { createId } from '@paralleldrive/cuid2'

export const DEFAULT_CHANNEL_NAME = 'General'

export async function ensureDefaultChannelMembership(db, userId) {
  const defaultChannel = await db('channels')
    .where({
      name: DEFAULT_CHANNEL_NAME,
      type: 'public',
      purpose: 'default',
      is_archived: false
    })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .first()

  if (!defaultChannel) return null

  const existingMembership = await db('channel_members')
    .where({ channel_id: defaultChannel.id, user_id: userId })
    .first()
  if (existingMembership) return existingMembership

  const membership = {
    id: createId(),
    channel_id: defaultChannel.id,
    user_id: userId,
    role: 'member'
  }

  await db('channel_members').insert(membership)
  return membership
}
