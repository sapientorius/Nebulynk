import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, NotFound } from '@feathersjs/errors'
import { MessagesDomainService } from '../src/domains/messages/service.js'

function createDomainService({
  repositoryOverrides = {},
  now = () => new Date('2026-03-07T10:00:00.000Z')
} = {}) {
  const repository = {
    async findChannelById(channelId) {
      if (channelId === 'channel-archived') {
        return { id: channelId, type: 'public', is_archived: true }
      }
      if (channelId === 'dm-1') {
        return { id: channelId, type: 'dm', is_archived: false }
      }
      return { id: channelId, type: 'public', is_archived: false }
    },
    async findMessageById(messageId) {
      if (messageId === 'message-own') {
        return { id: messageId, channel_id: 'channel-1', user_id: 'user-1' }
      }
      if (messageId === 'message-other') {
        return { id: messageId, channel_id: 'channel-1', user_id: 'user-2' }
      }
      return null
    },
    async softDeleteMessage() {},
    ...repositoryOverrides
  }

  return new MessagesDomainService({ repository, now })
}

test('messages policy: find requires channel_id', () => {
  const service = createDomainService()

  assert.throws(() => service.assertFindAccess({}), BadRequest)
})

test('messages behavior: create access rejects archived channels', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveCreateAccess('channel-archived'),
    BadRequest
  )
})

test('messages behavior: DM channels skip send_messages permission check', async () => {
  const service = createDomainService()

  const result = await service.resolveCreateAccess('dm-1')
  assert.equal(result.skipSendPermissionCheck, true)
})

test('messages behavior: prepareCreateData keeps file IDs out of persisted payload', () => {
  const service = createDomainService()

  const prepared = service.prepareCreateData({
    channel_id: 'channel-1',
    content: 'Hello',
    file_ids: ['file-1']
  })

  assert.equal(prepared.data.type, 'file')
  assert.equal(prepared.data.file_ids, undefined)
  assert.deepEqual(prepared.fileIds, ['file-1'])
  assert.ok(prepared.data.id)
})

test('messages policy: mutation access rejects missing messages', async () => {
  const service = createDomainService()

  await assert.rejects(
    service.resolveMutationAccess({
      messageId: 'missing',
      currentUserId: 'user-1',
      currentQuery: {}
    }),
    NotFound
  )
})

test('messages behavior: mutation access scopes permission check to message channel', async () => {
  const service = createDomainService()

  const access = await service.resolveMutationAccess({
    messageId: 'message-other',
    currentUserId: 'user-1',
    currentQuery: { $limit: 1 }
  })

  assert.equal(access.requiresManagePermission, true)
  assert.deepEqual(access.query, { $limit: 1, channel_id: 'channel-1' })
})

test('messages behavior: own-message patch gets edited_at timestamp', () => {
  const service = createDomainService()

  const result = service.addEditedAt({ content: 'Updated' })
  assert.equal(result.content, 'Updated')
  assert.equal(result.edited_at, '2026-03-07T10:00:00.000Z')
})

test('messages behavior: replies must stay in the same channel', async () => {
  const service = createDomainService({
    repositoryOverrides: {
      async findMessageById(messageId) {
        if (messageId === 'message-other-channel') {
          return { id: messageId, channel_id: 'channel-2', user_id: 'user-2' }
        }
        return null
      }
    }
  })

  await assert.rejects(
    service.resolveReplyAccess({
      channelId: 'channel-1',
      replyToMessageId: 'message-other-channel'
    }),
    BadRequest
  )
})

test('messages behavior: replies can point to messages in the same channel', async () => {
  const service = createDomainService({
    repositoryOverrides: {
      async findMessageById(messageId) {
        if (messageId === 'message-same-channel') {
          return { id: messageId, channel_id: 'channel-1', user_id: 'user-2' }
        }
        return null
      }
    }
  })

  const reply = await service.resolveReplyAccess({
    channelId: 'channel-1',
    replyToMessageId: 'message-same-channel'
  })

  assert.equal(reply.id, 'message-same-channel')
})
