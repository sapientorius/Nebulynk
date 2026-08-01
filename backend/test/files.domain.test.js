import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden, NotFound } from '@feathersjs/errors'
import { FilesDomainService } from '../src/domains/files/service.js'

function createDomainService({ repositoryOverrides = {} } = {}) {
  const repository = {
    async findMessageById(messageId) {
      if (messageId === 'message-1') {
        return { id: messageId, channel_id: 'channel-1' }
      }
      return null
    },
    async findFileById(fileId) {
      if (fileId === 'file-owner') {
        return { id: fileId, user_id: 'user-1', message_id: null }
      }
      if (fileId === 'file-linked') {
        return { id: fileId, user_id: 'user-2', message_id: 'message-1' }
      }
      if (fileId === 'file-unlinked') {
        return { id: fileId, user_id: 'user-2', message_id: null }
      }
      return null
    },
    async findChannelMembership(channelId, userId) {
      if (channelId === 'channel-1' && userId === 'user-1') {
        return { channel_id: channelId, user_id: userId }
      }
      return null
    },
    async findFiles() {
      return []
    },
    async deleteFileById() {},
    ...repositoryOverrides
  }

  return new FilesDomainService({ repository })
}

test('files policy: non-admin cannot filter by another user_id', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveFindAccess({
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: { user_id: 'user-2' }
    }),
    Forbidden
  )
})

test('files behavior: message-scoped find requires channel membership', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveFindAccess({
      provider: 'rest',
      user: { id: 'user-2', is_admin: false },
      query: { message_id: 'message-1' }
    }),
    Forbidden
  )
})

test('files behavior: find access normalizes limit and scope flags', async () => {
  const service = createDomainService()

  const access = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { message_id: 'message-1', $limit: 500 }
  })

  assert.equal(access.limit, 100)
  assert.equal(access.restrictToAccessibleScope, true)
  assert.equal(access.currentUserId, 'user-1')
})

test('files policy: get rejects missing files', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveGetAccess('missing', {
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    NotFound
  )
})

test('files policy: get blocks foreign unlinked file reads', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveGetAccess('file-unlinked', {
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    Forbidden
  )
})

test('files behavior: remove on foreign linked file requires manage_messages scope query', async () => {
  const service = createDomainService()

  const access = await service.resolveRemoveAccess('file-linked', {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { $limit: 1 }
  })

  assert.equal(access.requiresManagePermission, true)
  assert.deepEqual(access.permissionQuery, { $limit: 1, channel_id: 'channel-1' })
})

test('files policy: remove blocks foreign unlinked files', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveRemoveAccess('file-unlinked', {
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    Forbidden
  )
})
