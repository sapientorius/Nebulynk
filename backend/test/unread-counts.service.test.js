import test from 'node:test'
import assert from 'node:assert/strict'
import { UnreadCountsService } from '../src/services/unread-counts/unread-counts.js'

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim()
}

test('unread-counts returns sparse unread rows and uses an unread-only join', async () => {
  let capturedSql = ''
  let capturedParams = []
  const service = new UnreadCountsService({
    Model: {
      async raw(sql, params) {
        capturedSql = normalizeSql(sql)
        capturedParams = params
        return {
          rows: [
            { channel_id: 'channel-1', count: '3' },
            { channel_id: 'channel-2', count: '1' }
          ]
        }
      }
    }
  })

  const result = await service.find({
    user: { id: 'user-1' }
  })

  assert.deepEqual(result, [
    { channel_id: 'channel-1', count: 3 },
    { channel_id: 'channel-2', count: 1 }
  ])
  assert.deepEqual(capturedParams, ['user-1'])
  assert.match(capturedSql, /FROM channel_members cm JOIN messages m/i)
  assert.doesNotMatch(capturedSql, /LEFT JOIN messages m/i)
})

test('unread-counts scopes the unread query to the authenticated user id', async () => {
  let capturedParams = []
  const service = new UnreadCountsService({
    Model: {
      async raw(_sql, params) {
        capturedParams = params
        return { rows: [] }
      }
    }
  })

  const result = await service.find({
    user: { id: 'user-42' }
  })

  assert.deepEqual(result, [])
  assert.deepEqual(capturedParams, ['user-42'])
})
