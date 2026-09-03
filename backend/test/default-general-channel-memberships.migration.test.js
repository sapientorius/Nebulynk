import test from 'node:test'
import assert from 'node:assert/strict'
import { up } from '../migrations/070_default_general_channel_memberships.js'
import { createMemoryDb } from './helpers/memory-db.js'

function activeMember(id, overrides = {}) {
  return {
    id,
    account_type: 'member',
    registration_status: 'active',
    disabled_at: null,
    ...overrides
  }
}

test('default General membership migration backfills only active enabled member accounts', async () => {
  const db = createMemoryDb({
    channels: [
      {
        id: 'general-new',
        name: 'General',
        type: 'public',
        purpose: 'default',
        is_archived: false,
        created_at: '2026-02-01T00:00:00.000Z'
      },
      {
        id: 'general-old',
        name: 'General',
        type: 'public',
        purpose: 'default',
        is_archived: false,
        created_at: '2026-01-01T00:00:00.000Z'
      },
      { id: 'other-public', name: 'Announcements', type: 'public', purpose: 'default', is_archived: false }
    ],
    users: [
      activeMember('eligible-member'),
      activeMember('existing-owner'),
      activeMember('disabled-member', { disabled_at: '2026-01-15T00:00:00.000Z' }),
      activeMember('guest-user', { account_type: 'guest' }),
      activeMember('pending-user', { registration_status: 'pending_admin_approval' })
    ],
    channel_members: [{
      id: 'owner-membership',
      channel_id: 'general-old',
      user_id: 'existing-owner',
      role: 'owner',
      notifications: 'none'
    }]
  })

  await up(db)

  assert.deepEqual(db.tables.channel_members.map(({ channel_id: channelId, user_id: userId, role }) => ({
    channelId,
    userId,
    role
  })), [
    { channelId: 'general-old', userId: 'existing-owner', role: 'owner' },
    { channelId: 'general-old', userId: 'eligible-member', role: 'member' }
  ])
})

test('default General membership migration does nothing without an active General channel', async () => {
  const db = createMemoryDb({
    channels: [{ id: 'allgemein', name: 'Allgemein', type: 'public', purpose: 'default', is_archived: false }],
    users: [activeMember('eligible-member')]
  })

  await up(db)

  assert.deepEqual(db.tables.channel_members, [])
})
