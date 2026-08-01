import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden, NotFound } from '@feathersjs/errors'
import { MentionsDomainService } from '../src/domains/mentions/service.js'

function createDomainService({ repositoryOverrides = {} } = {}) {
  const repository = {
    async findMessageById(messageId) {
      if (messageId === 'message-1') {
        return { id: messageId, channel_id: 'channel-1' }
      }
      return null
    },
    async findChannelMembership(channelId, userId) {
      if (channelId === 'channel-1' && userId === 'user-1') {
        return { channel_id: channelId, user_id: userId }
      }
      return null
    },
    async findMentions() {
      return []
    },
    ...repositoryOverrides
  }

  return new MentionsDomainService({ repository })
}

test('mentions policy: find requires user_id or message_id', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveFindAccess({
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    BadRequest
  )
})

test('mentions policy: non-admin cannot query mentions for other users', async () => {
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

test('mentions policy: message filter rejects missing messages', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveFindAccess({
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: { message_id: 'missing' }
    }),
    NotFound
  )
})

test('mentions behavior: message filter requires channel membership for non-admin', async () => {
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

test('mentions behavior: non-admin user lookups are self-scoped', async () => {
  const service = createDomainService()

  const access = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { user_id: 'user-1', $limit: 500 }
  })

  assert.equal(access.userId, 'user-1')
  assert.equal(access.messageId, null)
  assert.equal(access.limit, 100)
  assert.equal(access.query.user_id, 'user-1')
})

test('mentions behavior: admin keeps requested user filter', async () => {
  const service = createDomainService()

  const access = await service.resolveFindAccess({
    provider: 'rest',
    user: { id: 'admin-1', is_admin: true },
    query: { user_id: 'user-2' }
  })

  assert.equal(access.userId, 'user-2')
})
