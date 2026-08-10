import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { MessageSearchService } from '../src/services/message-search/message-search.js'

function createService({
  membership = { channel_id: 'channel-1', user_id: 'user-1' },
  rawResponses = []
} = {}) {
  const rawCalls = []
  const membershipWhereCalls = []
  let rawCallIndex = 0

  const db = (table) => {
    if (table === 'channels') {
      const channelBuilder = {
        where() {
          return channelBuilder
        },
        async first() {
          return { id: 'channel-1', type: 'private', purpose: 'default' }
        }
      }
      return channelBuilder
    }
    assert.equal(table, 'channel_members')
    const builder = {
      where(filters) {
        membershipWhereCalls.push(filters)
        return builder
      },
      async first() {
        return membership
      }
    }
    return builder
  }

  db.raw = async (sql, bindings) => {
    rawCalls.push({ sql, bindings })
    const next = rawResponses[rawCallIndex] || []
    rawCallIndex += 1
    return { rows: next }
  }

  return {
    service: new MessageSearchService({ Model: db }),
    rawCalls,
    membershipWhereCalls
  }
}

test('message-search rejects missing q', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: {}
    }),
    BadRequest
  )
})

test('message-search rejects short q values', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: { q: 'ab' }
    }),
    BadRequest
  )
})

test('message-search rejects malformed cursor pairs', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: {
        q: 'alpha',
        before_created_at: '2026-03-16T10:00:00.000Z'
      }
    }),
    BadRequest
  )
})

test('message-search rejects channel-scoped search for non-members', async () => {
  const { service } = createService({ membership: null })

  await assert.rejects(
    service.find({
      user: { id: 'user-1', is_admin: false },
      query: {
        q: 'alpha',
        channel_id: 'channel-2'
      }
    }),
    Forbidden
  )
})

test('message-search scopes member search and returns FTS results with stable cursor metadata', async () => {
  const rows = [
    {
      id: 'message-2',
      channel_id: 'channel-1',
      user_id: 'user-2',
      created_at: '2026-03-16T09:02:00.000Z',
      type: 'text',
      user_display_name: 'Bob',
      channel_name: 'General',
      snippet: 'alpha two',
      match_mode: 'fts'
    },
    {
      id: 'message-1',
      channel_id: 'channel-1',
      user_id: 'user-1',
      created_at: '2026-03-16T09:01:00.000Z',
      type: 'text',
      user_display_name: 'Alice',
      channel_name: 'General',
      snippet: 'alpha one',
      match_mode: 'fts'
    }
  ]
  const { service, rawCalls, membershipWhereCalls } = createService({
    rawResponses: [rows]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'alpha',
      channel_id: 'channel-1',
      $limit: 2,
      before_created_at: '2026-03-16T10:00:00.000Z',
      before_id: 'message-9'
    }
  })

  assert.deepEqual(membershipWhereCalls, [
    { channel_id: 'channel-1', user_id: 'user-1' }
  ])
  assert.equal(rawCalls.length, 1)
  assert.match(rawCalls[0].sql, /websearch_to_tsquery/)
  assert.match(rawCalls[0].sql, /ORDER BY m\.created_at DESC, m\.id DESC/)
  assert.deepEqual(rawCalls[0].bindings, [
    'channel-1',
    ...Array(7).fill('user-1'),
    '2026-03-16T10:00:00.000Z',
    '2026-03-16T10:00:00.000Z',
    'message-9',
    'alpha',
    2
  ])
  assert.deepEqual(Object.keys(result.data[0]).sort(), [
    'channel_id',
    'channel_name',
    'created_at',
    'id',
    'match_mode',
    'snippet',
    'type',
    'user_display_name',
    'user_id'
  ])
  assert.equal(result.data[0].reactions, undefined)
  assert.deepEqual(result.next_cursor, {
    before_created_at: '2026-03-16T09:01:00.000Z',
    before_id: 'message-1'
  })
})

test('message-search falls back to trigram matching when FTS returns no rows', async () => {
  const trigramRows = [
    {
      id: 'message-3',
      channel_id: 'channel-1',
      user_id: 'user-2',
      created_at: '2026-03-16T09:03:00.000Z',
      type: 'text',
      user_display_name: 'Bob',
      channel_name: 'General',
      snippet: 'alphabet soup',
      match_mode: 'trigram'
    }
  ]
  const { service, rawCalls } = createService({
    rawResponses: [[], trigramRows]
  })

  const result = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: {
      q: 'phabe',
      channel_id: 'channel-1'
    }
  })

  assert.equal(rawCalls.length, 2)
  assert.match(rawCalls[1].sql, /lower\(m\.content\) LIKE \? ESCAPE/)
  assert.match(rawCalls[1].sql, /ESCAPE '\\'/)
  assert.deepEqual(rawCalls[1].bindings.slice(-2), ['%phabe%', 20])
  assert.equal(result.data[0].match_mode, 'trigram')
  assert.equal(result.next_cursor, null)
})

test('message-search allows admins to search without membership preflight', async () => {
  const { service, membershipWhereCalls, rawCalls } = createService({
    membership: null,
    rawResponses: [[]]
  })

  await service.find({
    user: { id: 'admin-1', is_admin: true },
    query: {
      q: 'alpha',
      channel_id: 'channel-9'
    }
  })

  assert.deepEqual(membershipWhereCalls, [])
  assert.deepEqual(rawCalls[0].bindings, ['channel-9', 'alpha', 20])
})
