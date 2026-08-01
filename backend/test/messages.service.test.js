import test from 'node:test'
import assert from 'node:assert/strict'
import { MessagesService } from '../src/services/messages/messages.js'

function createMessagesService(rows = [], options = {}) {
  const state = {
    whereCalls: [],
    orderByCalls: [],
    limitCalls: [],
    nestedWhereCalls: []
  }
  const queue = Array.isArray(rows) && Array.isArray(rows[0]) ? rows.map((entry) => [...entry]) : [rows]

  const builder = {
    join() {
      return builder
    },
    select() {
      return builder
    },
    whereNull(...args) {
      state.whereCalls.push(['whereNull', ...args])
      return builder
    },
    where(columnOrCallback, ...rest) {
      if (typeof columnOrCallback === 'function') {
        const nested = {
          where(...args) {
            state.nestedWhereCalls.push(['where', ...args])
            return nested
          },
          orWhere(callback) {
            const branch = {
              where(...args) {
                state.nestedWhereCalls.push(['or.where', ...args])
                return branch
              },
              andWhere(...args) {
                state.nestedWhereCalls.push(['or.andWhere', ...args])
                return branch
              }
            }
            callback(branch)
            return nested
          }
        }
        columnOrCallback(nested)
        return builder
      }

      state.whereCalls.push(['where', columnOrCallback, ...rest])
      return builder
    },
    orderBy(...args) {
      state.orderByCalls.push(args)
      return builder
    },
    limit(value) {
      state.limitCalls.push(value)
      return builder
    },
    then(resolve, reject) {
      const nextRows = queue.length > 0 ? queue.shift() : []
      return Promise.resolve(nextRows).then(resolve, reject)
    }
  }

  const db = (table) => {
    assert.equal(table, 'messages')
    return builder
  }

  const service = new MessagesService({
    Model: db,
    name: 'messages',
    repository: options.repository || {},
    domainService: {
      assertFindAccess(query) {
        assert.equal(query.channel_id, 'channel-1')
      }
    }
  })
  service.attachMessageRelations = async () => {}

  return { service, state }
}

test('messages.find orders by created_at and id descending before reversing for display order', async () => {
  const rows = [
    { id: 'message-3', created_at: '2026-03-16T09:02:00.000Z' },
    { id: 'message-2', created_at: '2026-03-16T09:01:00.000Z' },
    { id: 'message-1', created_at: '2026-03-16T09:00:00.000Z' }
  ]
  const { service, state } = createMessagesService(rows)

  const result = await service.find({
    query: {
      channel_id: 'channel-1',
      $limit: 3
    }
  })

  assert.deepEqual(state.orderByCalls, [
    ['messages.created_at', 'desc'],
    ['messages.id', 'desc']
  ])
  assert.deepEqual(result.data.map((message) => message.id), [
    'message-1',
    'message-2',
    'message-3'
  ])
})

test('messages.find uses composite before cursor when before and before_id are supplied', async () => {
  const { service, state } = createMessagesService([])

  await service.find({
    query: {
      channel_id: 'channel-1',
      before: '2026-03-16T09:05:00.000Z',
      before_id: 'message-5'
    }
  })

  assert.deepEqual(state.nestedWhereCalls, [
    ['where', 'messages.created_at', '<', '2026-03-16T09:05:00.000Z'],
    ['or.where', 'messages.created_at', '=', '2026-03-16T09:05:00.000Z'],
    ['or.andWhere', 'messages.id', '<', 'message-5']
  ])
})

test('messages.find uses composite after cursor when after and after_id are supplied', async () => {
  const { service, state } = createMessagesService([])

  await service.find({
    query: {
      channel_id: 'channel-1',
      after: '2026-03-16T09:05:00.000Z',
      after_id: 'message-5'
    }
  })

  assert.deepEqual(state.nestedWhereCalls, [
    ['where', 'messages.created_at', '>', '2026-03-16T09:05:00.000Z'],
    ['or.where', 'messages.created_at', '=', '2026-03-16T09:05:00.000Z'],
    ['or.andWhere', 'messages.id', '>', 'message-5']
  ])
})

test('messages.find returns contextual window around an anchor message', async () => {
  const anchor = {
    id: 'message-5',
    channel_id: 'channel-1',
    created_at: '2026-03-16T09:05:00.000Z',
    user_display_name: 'Anchor'
  }
  const beforeRows = [{
    id: 'message-4',
    channel_id: 'channel-1',
    created_at: '2026-03-16T09:04:00.000Z'
  }]
  const afterRows = [{
    id: 'message-6',
    channel_id: 'channel-1',
    created_at: '2026-03-16T09:06:00.000Z'
  }]
  const { service } = createMessagesService([beforeRows, afterRows], {
    repository: {
      async findMessageByIdWithAuthor(messageId) {
        assert.equal(messageId, 'message-5')
        return anchor
      }
    }
  })
  service.attachMessageRelations = async () => {}

  const result = await service.find({
    query: {
      channel_id: 'channel-1',
      around_message_id: 'message-5'
    }
  })

  assert.equal(result.anchor_message_id, 'message-5')
  assert.equal(result.has_more_before, false)
  assert.equal(result.has_more_after, false)
  assert.deepEqual(result.data.map((message) => message.id), [
    'message-4',
    'message-5',
    'message-6'
  ])
})

test('messages.find dedupes duplicated anchor rows in contextual results', async () => {
  const anchor = {
    id: 'message-5',
    channel_id: 'channel-1',
    created_at: '2026-03-16T09:05:00.000Z',
    user_display_name: 'Anchor'
  }
  const beforeRows = [{
    id: 'message-4',
    channel_id: 'channel-1',
    created_at: '2026-03-16T09:04:00.000Z'
  }]
  const afterRows = [
    {
      id: 'message-5',
      channel_id: 'channel-1',
      created_at: '2026-03-16T09:05:00.000Z'
    },
    {
      id: 'message-6',
      channel_id: 'channel-1',
      created_at: '2026-03-16T09:06:00.000Z'
    }
  ]
  const { service } = createMessagesService([beforeRows, afterRows], {
    repository: {
      async findMessageByIdWithAuthor() {
        return anchor
      }
    }
  })
  service.attachMessageRelations = async () => {}

  const result = await service.find({
    query: {
      channel_id: 'channel-1',
      around_message_id: 'message-5'
    }
  })

  assert.deepEqual(result.data.map((message) => message.id), [
    'message-4',
    'message-5',
    'message-6'
  ])
})
