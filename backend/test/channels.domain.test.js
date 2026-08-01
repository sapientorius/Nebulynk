import test from 'node:test'
import assert from 'node:assert/strict'
import { NotFound } from '@feathersjs/errors'
import { ChannelsDomainService } from '../src/domains/channels/service.js'

function createDomainService({
  repositoryOverrides = {},
  now = () => new Date('2026-03-07T10:00:00.000Z')
} = {}) {
  const calls = {
    addMembership: [],
    removeMembership: []
  }

  const repository = {
    async findUserMembershipChannelIds() {
      return ['private-1', 'private-2']
    },
    async hasPlatformManageChannelsPermission() {
      return false
    },
    async hasChannelManageChannelsPermission() {
      return false
    },
    async findChannelById(channelId) {
      if (channelId === 'missing') return null
      return { id: channelId }
    },
    async findMembership(channelId, userId) {
      if (channelId === 'existing') {
        return { id: 'membership-1', channel_id: channelId, user_id: userId, role: 'member' }
      }
      return null
    },
    async addMembership(memberData) {
      calls.addMembership.push(memberData)
    },
    async removeMembership(channelId, userId) {
      calls.removeMembership.push({ channelId, userId })
      return channelId === 'channel-1' ? 1 : 0
    },
    ...repositoryOverrides
  }

  const service = new ChannelsDomainService({ repository, now })
  return { service, calls }
}

test('channels policy: include_archived is forced off without manage_channels permission', async () => {
  const { service } = createDomainService()

  const result = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { include_archived: true }
  })

  assert.equal(result.includeArchived, false)
  assert.equal(result.discoverPublic, false)
  assert.deepEqual(result.accessibleChannelIds, ['private-1', 'private-2'])
})

test('channels policy: include_archived stays on with manage_channels permission', async () => {
  const { service } = createDomainService({
    repositoryOverrides: {
      async hasPlatformManageChannelsPermission() {
        return true
      }
    }
  })

  const result = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { include_archived: 'true' }
  })

  assert.equal(result.includeArchived, true)
})

test('channels behavior: internal/admin find bypasses membership scoping', async () => {
  const { service } = createDomainService()

  const internalResult = await service.resolveFindAccess({
    provider: null,
    user: { id: 'user-1', is_admin: false },
    query: { include_archived: true }
  })

  assert.equal(internalResult.includeArchived, true)
  assert.equal(internalResult.discoverPublic, false)
  assert.deepEqual(internalResult.accessibleChannelIds, [])
})

test('channels policy: discover_public keeps archived disabled and sets discover mode', async () => {
  const { service } = createDomainService()

  const result = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { discover_public: true, include_archived: true }
  })

  assert.equal(result.discoverPublic, true)
  assert.equal(result.includeArchived, false)
})

test('channels behavior: patch archive metadata is derived centrally', () => {
  const { service } = createDomainService()

  const archived = service.addArchiveMetadata({ is_archived: true }, 'user-1')
  assert.equal(archived.archived_by, 'user-1')
  assert.equal(archived.archived_at, '2026-03-07T10:00:00.000Z')

  const unarchived = service.addArchiveMetadata({ is_archived: false }, 'user-1')
  assert.equal(unarchived.archived_by, null)
  assert.equal(unarchived.archived_at, null)
})

test('channels behavior: join returns existing membership when present', async () => {
  const { service, calls } = createDomainService()

  const result = await service.joinChannel('existing', 'user-1')
  assert.equal(result.id, 'membership-1')
  assert.equal(calls.addMembership.length, 0)
})

test('channels behavior: join creates membership for first-time members', async () => {
  const { service, calls } = createDomainService()

  const result = await service.joinChannel('channel-1', 'user-1')
  assert.equal(result.channel_id, 'channel-1')
  assert.equal(result.user_id, 'user-1')
  assert.equal(calls.addMembership.length, 1)
})

test('channels policy: leave rejects users without membership', async () => {
  const { service } = createDomainService()

  await assert.rejects(
    service.leaveChannel('channel-unknown', 'user-1'),
    NotFound
  )
})
