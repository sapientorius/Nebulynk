import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { MeetingsService } from '../src/services/meetings/meetings.js'
import { processPendingMeetingSourceMessages } from '../src/domains/meetings/source-messages.js'
import { createRuntime } from '../src/lib/runtime.js'

let fixture, db
const baseTime = new Date('2026-10-13T12:00:00Z')
before(async () => { fixture = await createPostgresTestDb(); db = fixture.db })
after(async () => fixture?.close())
beforeEach(async () => {
  await db('meetings').delete()
  await db('channels').delete()
  await db('users').delete()
  await db('users').insert(['host', 'member', 'guest', 'outsider'].map(id => ({
    id, email: `${id}@source-card.invalid`, display_name: id, password: 'unused', webauthn_user_id: id,
    account_type: id === 'guest' ? 'guest' : 'member'
  })))
  await db('channels').insert({ id: 'source', name: 'Source', type: 'private' })
  await db('channel_members').insert(['host', 'member'].map(userId => ({
    id: `source-${userId}`, channel_id: 'source', user_id: userId
  })))
})

function harness(t, { automatic = false } = {}) {
  const events = [], warnings = []
  let clock = new Date(baseTime)
  const log = { warn: (message, data) => warnings.push({ message, ...data }), error() {} }
  const app = feathers()
  app.set('postgresqlClient', db)
  const runtime = createRuntime({ log })
  app.set('runtime', runtime)
  app.use('voice', { async create() { return { token: 'test' } }, async patch() {} })
  for (const name of ['channels', 'notifications', 'messages']) app.use(name, { async create(data) { return data } })
  app.use('meetings', new MeetingsService({ Model: db, app, now: () => clock }))
  const service = app.service('meetings')
  app.service('messages').on('created', message => events.push(message))
  if (!automatic) service.dependencies.effects._queueSourceMessage = () => {}
  t.after(() => runtime.stop())
  return {
    app, service, events, warnings, runtime,
    params: { user: { id: 'host', display_name: 'host', is_admin: false } },
    setTime(value) { clock = new Date(value) },
    process: (options = {}) => processPendingMeetingSourceMessages(app, { now: () => clock, log, ...options })
  }
}

async function scheduled(h, extra = {}) {
  return h.service.create({ source_channel_id: 'source', initial_user_ids: ['member'],
    scheduled_start_at: '2026-10-13T14:00:00Z', ...extra }, h.params)
}

async function activated(t) {
  const h = harness(t)
  const meeting = await scheduled(h)
  await h.service.join(meeting.id, {}, h.params)
  return { ...h, meeting }
}

test('planning, rescheduling, link creation and cancellation never enqueue a source card', async t => {
  const h = harness(t)
  const meeting = await scheduled(h)
  await h.service.reschedule(meeting.id, { scheduled_start_at: '2026-10-14T14:00:00Z' }, h.params)
  await h.service.createInviteLink(meeting.id, {}, h.params)
  await h.service.cancel(meeting.id, {}, h.params)
  assert.equal((await h.process()).created, 0)
  assert.equal((await db('messages').where('channel_id', 'source')).length, 0)
  assert.equal((await db('meetings').where('id', meeting.id).first()).source_message_pending_at, null)
})

test('first start asynchronously publishes one indexed host card without extra notifications', async t => {
  const h = harness(t, { automatic: true })
  const meeting = await scheduled(h)
  const notificationsBefore = await db('notifications').count('* as count').first()
  const result = await h.service.join(meeting.id, {}, h.params)
  await h.runtime.drain()
  assert.equal(result.meeting.status, 'active')
  assert.equal(Object.hasOwn(result.meeting, 'source_message_pending_at'), false)
  const [message] = await db('messages').where('channel_id', 'source')
  assert.equal(message.content, `[Meeting] /meetings/${meeting.id}`)
  assert.equal(message.user_id, 'host')
  assert.equal(message.type, 'text')
  assert.equal(message.created_at.toISOString(), baseTime.toISOString())
  assert.equal(message.updated_at.toISOString(), baseTime.toISOString())
  assert.equal(h.events.length, 1)
  assert.equal(h.events[0].user_display_name, 'host')
  assert.equal((await db('search_documents').where('source_message_id', message.id)).length, 1)
  assert.deepEqual(await db('notifications').count('* as count').first(), notificationsBefore)
  assert.equal((await db('meetings').where('id', meeting.id).first()).source_message_pending_at, null)
})

test('a failed immediate background write never rejects the first join or prevents voice setup', async t => {
  const h = harness(t, { automatic: true })
  const meeting = await scheduled(h)
  await db.raw("CREATE FUNCTION source_card_immediate_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic immediate write failure'; END $$")
  await db.raw('CREATE TRIGGER source_card_immediate_fail BEFORE INSERT ON messages FOR EACH ROW EXECUTE FUNCTION source_card_immediate_fail()')
  t.after(async () => {
    await db.raw('DROP TRIGGER IF EXISTS source_card_immediate_fail ON messages')
    await db.raw('DROP FUNCTION IF EXISTS source_card_immediate_fail()')
  })
  const joined = await h.service.join(meeting.id, {}, h.params)
  assert.equal(joined.meeting.status, 'active')
  assert.equal(joined.voice.token, 'test')
  await h.runtime.drain()
  const stored = await db('meetings').where('id', meeting.id).first()
  assert.equal(stored.status, 'active')
  assert.ok(stored.source_message_pending_at)
  assert.equal((await db('messages').where('channel_id', 'source')).length, 0)
  await db.raw('DROP TRIGGER source_card_immediate_fail ON messages')
  h.setTime(new Date(stored.source_message_pending_at.getTime() + 1))
  assert.equal((await h.process()).created, 1)
})

test('concurrent first joins and processors preserve one activation, snapshot and card', async t => {
  const h = harness(t)
  const meeting = await scheduled(h)
  await db('meetings').where('id', meeting.id).update({ join_not_before: baseTime })
  await Promise.all([
    h.service.join(meeting.id, {}, h.params),
    h.service.join(meeting.id, {}, { user: { id: 'member' } }),
    h.service.join(meeting.id, {}, h.params)
  ])
  const row = await db('meetings').where('id', meeting.id).first()
  assert.equal(row.started_at.toISOString(), baseTime.toISOString())
  assert.equal((await db('meeting_start_members').where('meeting_id', meeting.id)).length, 2)
  assert.equal((await db('meeting_participants').where({ meeting_id: meeting.id, user_id: 'host' })).length, 1)
  await Promise.all([h.process(), h.process(), h.process()])
  await h.service.join(meeting.id, {}, h.params)
  await h.process()
  assert.equal((await db('messages').where('channel_id', 'source')).length, 1)
  assert.equal(h.events.length, 1)
})

test('early and late activation replace stale scheduled start metadata with the actual start time', async t => {
  const h = harness(t)
  for (const actual of ['2026-10-13T12:00:00Z', '2026-10-13T15:00:00Z']) {
    const meeting = await scheduled(h)
    await db('meetings').where('id', meeting.id).update({ started_at: new Date('2026-10-13T14:00:00Z') })
    h.setTime(actual)
    await h.service.join(meeting.id, {}, h.params)
    await h.process()
    const stored = await db('meetings').where('id', meeting.id).first()
    const message = await db('messages').where('content', `[Meeting] /meetings/${meeting.id}`).first()
    assert.equal(stored.started_at.toISOString(), new Date(actual).toISOString())
    assert.equal(message.created_at.toISOString(), new Date(actual).toISOString())
  }
})

test('a guest can activate within the join window; only the host authors the source card', async t => {
  const h = harness(t)
  const meeting = await scheduled(h)
  await db('meeting_participants').insert({ id: 'guest-participant', meeting_id: meeting.id, user_id: 'guest' })
  await db('meetings').where('id', meeting.id).update({ join_not_before: baseTime })
  await h.service.join(meeting.id, {}, { user: { id: 'guest', account_type: 'guest' } })
  await h.process()
  assert.equal((await db('messages').where('channel_id', 'source').first()).user_id, 'host')
  assert.equal((await db('channel_members').where({ channel_id: 'source', user_id: 'guest' })).length, 0)
  await assert.rejects(h.service.join(meeting.id, {}, { user: { id: 'outsider' } }), error => error.code === 403)
})

for (const table of ['messages', 'search_documents']) {
  test(`${table} storage failure leaves the meeting active and retries after restart at its original start time`, async t => {
    const h = await activated(t)
    await db.raw("CREATE FUNCTION source_card_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic source card write failure'; END $$")
    await db.raw('CREATE TRIGGER source_card_fail BEFORE INSERT ON ?? FOR EACH ROW EXECUTE FUNCTION source_card_fail()', [table])
    t.after(async () => {
      await db.raw('DROP TRIGGER IF EXISTS source_card_fail ON ??', [table])
      await db.raw('DROP FUNCTION IF EXISTS source_card_fail()')
    })
    assert.equal((await h.process()).failed, 1)
    const failedMeeting = await db('meetings').where('id', h.meeting.id).first()
    assert.equal(failedMeeting.status, 'active')
    assert.equal(failedMeeting.source_message_pending_at.toISOString(), '2026-10-13T12:00:30.000Z')
    assert.equal((await db('messages').where('channel_id', 'source')).length, 0)
    assert.equal(h.events.length, 0)
    assert.equal((await h.process()).processed, 0)
    await db.raw('DROP TRIGGER source_card_fail ON ??', [table])
    await db('meetings').where('id', h.meeting.id).update({ status: 'ended', ended_at: new Date('2026-10-13T12:00:20Z') })
    await db('messages').insert({ id: 'later', channel_id: 'source', user_id: 'host', content: 'After start', created_at: new Date('2026-10-13T12:00:10Z') })
    const restarted = harness(t)
    restarted.setTime('2026-10-13T12:00:31Z')
    assert.equal((await restarted.process()).created, 1)
    const rows = await db('messages').where('channel_id', 'source').orderBy('created_at')
    assert.equal(rows[0].content, `[Meeting] /meetings/${h.meeting.id}`)
    assert.equal(rows[0].created_at.toISOString(), baseTime.toISOString())
    assert.equal(rows[1].id, 'later')
    assert.equal((await db('meetings').where('id', h.meeting.id).first()).source_message_pending_at, null)
  })
}

for (const deleted of [false, true]) {
  test(`an existing ${deleted ? 'deleted' : 'visible'} exact reference prevents duplicate or resurrected cards`, async t => {
    const h = await activated(t)
    await db('messages').insert({ id: 'existing', channel_id: 'source', user_id: 'host',
      content: `[Meeting] /meetings/${h.meeting.id}`, deleted_at: deleted ? baseTime : null })
    assert.equal((await h.process()).created, 0)
    assert.equal((await db('messages').where('channel_id', 'source')).length, 1)
    assert.equal((await db('messages').where('id', 'existing').first()).deleted_at !== null, deleted)
    assert.equal(h.events.length, 0)
  })
}

for (const reason of ['archived', 'missing', 'host_removed']) {
  test(`${reason} source access clears the pending card without undoing the meeting`, async t => {
    const h = await activated(t)
    if (reason === 'archived') await db('channels').where('id', 'source').update({ is_archived: true })
    if (reason === 'missing') await db('channels').where('id', 'source').delete()
    if (reason === 'host_removed') await db('channel_members').where({ channel_id: 'source', user_id: 'host' }).delete()
    assert.equal((await h.process()).skipped, 1)
    const meeting = await db('meetings').where('id', h.meeting.id).first()
    assert.equal(meeting.status, 'active')
    assert.equal(meeting.source_message_pending_at, null)
    assert.equal(h.events.length, 0)
    assert.ok(h.warnings[0].reason)
  })
}

test('admin hosts retain their membership bypass and failed event delivery does not recreate cards', async t => {
  const h = await activated(t)
  await db('users').where('id', 'host').update({ is_admin: true })
  await db('channel_members').where({ channel_id: 'source', user_id: 'host' }).delete()
  h.app.service('messages').on('created', () => { throw new Error('synthetic event failure') })
  assert.equal((await h.process()).created, 1)
  assert.equal((await h.process()).created, 0)
  assert.equal((await db('messages').where('channel_id', 'source')).length, 1)
  assert.ok(h.warnings.some(entry => entry.message.includes('publish')))
})

test('legacy active and ended meetings without a pending marker are never backfilled', async t => {
  const h = harness(t)
  for (const status of ['active', 'ended']) {
    const meeting = await scheduled(h)
    await db('meetings').where('id', meeting.id).update({ status, started_at: baseTime, source_message_pending_at: null })
    if (status === 'active') await h.service.join(meeting.id, {}, h.params)
  }
  assert.equal((await h.process()).processed, 0)
  assert.equal((await db('messages').where('channel_id', 'source')).length, 0)
})
