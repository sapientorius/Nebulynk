import test from 'node:test'
import assert from 'node:assert/strict'
import { ensureDefaultChannelMembership } from '../src/lib/default-channel-membership.js'
import { createMemoryDb } from './helpers/memory-db.js'

function generalChannel(id, createdAt, overrides = {}) {
  return {
    id,
    name: 'General',
    type: 'public',
    purpose: 'default',
    is_archived: false,
    created_at: createdAt,
    ...overrides
  }
}

test('default channel membership joins only the oldest active General channel once', async () => {
  const db = createMemoryDb({
    channels: [
      generalChannel('general-new', '2026-02-01T00:00:00.000Z'),
      generalChannel('general-old', '2026-01-01T00:00:00.000Z'),
      generalChannel('general-archived', '2025-12-01T00:00:00.000Z', { is_archived: true }),
      { id: 'other-public', name: 'Announcements', type: 'public', purpose: 'default', is_archived: false }
    ]
  })

  await ensureDefaultChannelMembership(db, 'new-member')
  await ensureDefaultChannelMembership(db, 'new-member')

  assert.deepEqual(db.tables.channel_members.map(({ channel_id: channelId, user_id: userId, role }) => ({
    channelId,
    userId,
    role
  })), [{
    channelId: 'general-old',
    userId: 'new-member',
    role: 'member'
  }])
})

test('default channel membership preserves an existing membership and ignores missing General', async () => {
  const withExistingMembership = createMemoryDb({
    channels: [generalChannel('general-1', '2026-01-01T00:00:00.000Z')],
    channel_members: [{
      id: 'existing-membership',
      channel_id: 'general-1',
      user_id: 'owner-user',
      role: 'owner',
      notifications: 'none'
    }]
  })

  await ensureDefaultChannelMembership(withExistingMembership, 'owner-user')
  assert.deepEqual(withExistingMembership.tables.channel_members, [{
    id: 'existing-membership',
    channel_id: 'general-1',
    user_id: 'owner-user',
    role: 'owner',
    notifications: 'none'
  }])

  const withoutGeneral = createMemoryDb({
    channels: [{ id: 'allgemein', name: 'Allgemein', type: 'public', purpose: 'default', is_archived: false }]
  })
  const result = await ensureDefaultChannelMembership(withoutGeneral, 'new-member')

  assert.equal(result, null)
  assert.deepEqual(withoutGeneral.tables.channel_members, [])
})
