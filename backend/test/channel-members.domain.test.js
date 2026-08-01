import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden, NotFound } from '@feathersjs/errors'
import { ChannelMembersDomainService } from '../src/domains/channel-members/service.js'

function createDomainService(repositoryOverrides = {}) {
  return new ChannelMembersDomainService({
    repository: {
      async findMembershipById() {
        return null
      },
      async findMembershipByChannelAndUser() {
        return null
      },
      async findChannelById(channelId) {
        return {
          id: channelId,
          type: 'public',
          is_archived: false,
          purpose: 'default'
        }
      },
      ...repositoryOverrides
    }
  })
}

test('channel-members policy: find requires channel_id for non-admin users', () => {
  const service = createDomainService()

  assert.throws(
    () => service.assertFindAccess({ user: { is_admin: false }, query: {} }),
    BadRequest
  )
})

test('channel-members policy: admins can find without channel_id', () => {
  const service = createDomainService()

  assert.doesNotThrow(() => {
    service.assertFindAccess({ user: { is_admin: true }, query: {} })
  })
})

test('channel-members policy: patch fails for unknown membership', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolvePatchAccess({
      membershipId: 'missing',
      currentUserId: 'user-1',
      patchData: { notifications: 'mentions' },
      currentQuery: {}
    }),
    NotFound
  )
})

test('channel-members policy: self notification patch does not require manage permission', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-1',
        channel_id: 'channel-1',
        user_id: 'user-1'
      }
    }
  })

  const result = await service.resolvePatchAccess({
    membershipId: 'membership-1',
    currentUserId: 'user-1',
    patchData: { notifications: 'none' },
    currentQuery: { $limit: 1 }
  })

  assert.deepEqual(result.query, { $limit: 1, channel_id: 'channel-1' })
  assert.equal(result.requiresManagePermission, false)
})

test('channel-members policy: self role patch requires manage permission', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-1',
        channel_id: 'channel-1',
        user_id: 'user-1'
      }
    }
  })

  const result = await service.resolvePatchAccess({
    membershipId: 'membership-1',
    currentUserId: 'user-1',
    patchData: { role: 'owner' },
    currentQuery: {}
  })

  assert.equal(result.requiresManagePermission, true)
})

test('channel-members policy: patching other user requires manage permission', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-1',
        channel_id: 'channel-1',
        user_id: 'user-2'
      }
    }
  })

  const result = await service.resolvePatchAccess({
    membershipId: 'membership-1',
    currentUserId: 'user-1',
    patchData: { notifications: 'all' },
    currentQuery: {}
  })

  assert.equal(result.requiresManagePermission, true)
})

test('channel-members policy: self join to active public channel is allowed without manage permission', async () => {
  const service = createDomainService()

  const result = await service.resolveCreateAccess({
    currentUserId: 'user-1',
    createData: { channel_id: 'channel-1', user_id: 'user-1' },
    currentQuery: {}
  })

  assert.equal(result.requiresManagePermission, false)
  assert.equal(result.normalizedCreateData.role, 'member')
})

test('channel-members policy: self join to private channel is rejected', async () => {
  const service = createDomainService({
    async findChannelById(channelId) {
      return {
        id: channelId,
        type: 'private',
        is_archived: false,
        purpose: 'default'
      }
    }
  })

  await assert.rejects(
    service.resolveCreateAccess({
      currentUserId: 'user-1',
      createData: { channel_id: 'channel-private', user_id: 'user-1' },
      currentQuery: {}
    }),
    Forbidden
  )
})

test('channel-members policy: self leave on group channel is allowed', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-group',
        channel_id: 'group-1',
        user_id: 'user-1'
      }
    },
    async findChannelById(channelId) {
      return {
        id: channelId,
        type: 'group',
        is_archived: false,
        purpose: 'default'
      }
    }
  })

  const result = await service.resolveRemoveAccess({
    membershipId: 'membership-group',
    currentUserId: 'user-1',
    currentQuery: {}
  })

  assert.equal(result.requiresManagePermission, false)
  assert.equal(result.query.channel_id, 'group-1')
})

test('channel-members policy: self leave on dm channel is rejected', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-dm',
        channel_id: 'dm-1',
        user_id: 'user-1'
      }
    },
    async findChannelById(channelId) {
      return {
        id: channelId,
        type: 'dm',
        is_archived: false,
        purpose: 'default'
      }
    }
  })

  await assert.rejects(
    service.resolveRemoveAccess({
      membershipId: 'membership-dm',
      currentUserId: 'user-1',
      currentQuery: {}
    }),
    (error) => {
      assert.equal(error instanceof Forbidden, true)
      assert.equal(error.data?.error_code, 'api.channels.dm_member_removal_not_supported')
      return true
    }
  )
})

test('channel-members policy: removing another member from dm channel is rejected', async () => {
  const service = createDomainService({
    async findMembershipById() {
      return {
        id: 'membership-dm-other',
        channel_id: 'dm-1',
        user_id: 'user-2'
      }
    },
    async findChannelById(channelId) {
      return {
        id: channelId,
        type: 'dm',
        is_archived: false,
        purpose: 'default'
      }
    }
  })

  await assert.rejects(
    service.resolveRemoveAccess({
      membershipId: 'membership-dm-other',
      currentUserId: 'admin-1',
      currentQuery: {}
    }),
    (error) => {
      assert.equal(error instanceof Forbidden, true)
      assert.equal(error.data?.error_code, 'api.channels.dm_member_removal_not_supported')
      return true
    }
  )
})
