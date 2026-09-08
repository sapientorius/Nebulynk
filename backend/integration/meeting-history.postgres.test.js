import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { resolveChannelReadAccess, resolveMeetingContentAccess, resolveMeetingContentAccessBatch } from '../src/domains/meetings/content-access.js'

let fixture, db
const policies = ['all_channel_members', 'meeting_start_members', 'active_participants']
const users = ['host', 'start', 'late', 'former', 'joined', 'invited', 'outsider']
before(async () => {
  fixture = await createPostgresTestDb()
  db = fixture.db
  await db('users').insert(users.map(id => ({ id, email: `${id}@test.invalid`, password: 'unused', display_name: id, webauthn_user_id: id })))
  for (const policy of policies) {
    await db('channels').insert([
      { id: policy, name: policy, type: 'private', meeting_history_access: policy },
      { id: `chat-${policy}`, name: 'Meeting chat', type: 'private', purpose: 'meeting', is_archived: true }
    ])
    await db('meetings').insert({ id: policy, source_channel_id: policy, chat_channel_id: `chat-${policy}`, host_user_id: 'host', status: 'ended', language: 'en' })
    await db('channel_members').insert(['start', 'late', 'former'].map(id => ({ id: `${policy}-${id}`, user_id: id, channel_id: policy })))
    await db('meeting_start_members').insert(['start', 'former'].map(id => ({ id: `snapshot-${policy}-${id}`, user_id: id, meeting_id: policy })))
    await db('channel_members').where({ channel_id: policy, user_id: 'former' }).delete()
    await db('meeting_participants').insert(['joined', 'invited'].map(id => ({ id: `participant-${policy}-${id}`, user_id: id, meeting_id: policy, joined_at: id === 'joined' ? '2026-09-08T10:00:00Z' : null })))
  }
})
after(async () => fixture?.close())

async function measured(run) {
  const queries = []
  const listener = query => queries.push(query.sql)
  db.on('query', listener)
  try { return { result: await run(), queries } } finally { db.off('query', listener) }
}

for (const id of users.filter(id => id !== 'host')) {
  test(`real SQL: ${id} has consistent single, batch and chat history access`, async () => {
    const user = { id, is_admin: false }
    const { result: batch, queries } = await measured(() => resolveMeetingContentAccessBatch(db, { meetings: policies.map(id => ({ id })), user }))
    assert.ok(queries.length <= 4, `Batch used ${queries.length} queries`)
    for (const policy of policies) {
      const expected = id === 'joined' || (id === 'start' && policy !== 'active_participants') || (id === 'late' && policy === 'all_channel_members')
      const single = await resolveMeetingContentAccess(db, { meetingId: policy, user })
      assert.equal(single.allowed, expected, `${id}/${policy}`)
      assert.deepEqual(batch.get(policy), single)
      const chat = await measured(() => resolveChannelReadAccess(db, { channelId: `chat-${policy}`, user }))
      assert.equal(chat.result.allowed, expected)
      assert.equal(chat.queries.length, 1, 'Joined channel-access query budget')
      assert.equal(single.cardVisible, ['start', 'late', 'joined', 'invited'].includes(id))
    }
  })
}

test('private channel reads require current membership and keep their one-query budget', async () => {
  for (const id of ['start', 'late', 'former', 'outsider']) {
    const { result, queries } = await measured(() => resolveChannelReadAccess(db, { channelId: policies[0], user: { id } }))
    assert.equal(result.allowed, ['start', 'late'].includes(id))
    assert.equal(queries.length, 1)
  }
})

test('batch query count stays bounded when meetings repeat and preloaded metadata is available', async () => {
  const meetings = policies.map(id => ({ id, status: 'ended', source_channel_id: id, source_channel_type: 'private', source_channel_meeting_history_access: id }))
  const { result, queries } = await measured(() => resolveMeetingContentAccessBatch(db, { meetings: Array(30).fill(meetings).flat(), user: { id: 'start' } }))
  assert.equal(result.size, 3)
  assert.equal(queries.length, 3)
})
