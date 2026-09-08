import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import { KnexService } from '@feathersjs/knex'
import { authentication } from '../src/authentication.js'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { MeetingsService, meetings as registerMeetings } from '../src/services/meetings/meetings.js'
import { MeetingCallsService, meetingCalls } from '../src/services/meeting-calls/meeting-calls.js'

let fixture, db, app, calls, meetings, events, clock
const user = id => ({ id, display_name: id })
const params = id => ({ user: user(id), provider: 'rest' })
before(async () => { fixture = await createPostgresTestDb(); db = fixture.db })
after(async () => fixture?.close())
beforeEach(async () => {
  await db('channels').delete()
  await db('users').delete()
  await db('users').insert(['caller', 'alice', 'bob', 'outsider'].map(id => ({
    id, email: `${id}@calls.invalid`, display_name: id, password: 'unused', webauthn_user_id: id
  })))
  await db('channels').insert({ id: 'source', name: 'group-test', type: 'group', created_by: 'caller' })
  await db('channel_members').insert(['caller', 'alice', 'bob'].map(id => ({ id: `member-${id}`, channel_id: 'source', user_id: id })))
  events = []
  clock = Date.now()
  const services = {}
  app = {
    get: name => name === 'postgresqlClient' ? db : null,
    service: name => services[name],
    channel: () => ({ connections: [], join() {} })
  }
  const emitter = name => ({ emit: (event, payload) => events.push({ name, event, payload }) })
  for (const name of ['messages', 'notifications', 'channels', 'voice']) services[name] = emitter(name)
  services.voice.create = () => { throw new Error('No media should be started by call signaling') }
  meetings = new MeetingsService({ Model: db, app, now: () => new Date(clock) })
  meetings.emit = emitter('meetings').emit
  services.meetings = meetings
  calls = new MeetingCallsService(app, { now: () => new Date(clock) })
  calls.emit = emitter('meeting-calls').emit
  services['meeting-calls'] = calls
})

const start = () => calls.create({ source_channel_id: 'source' }, params('caller'))
const count = async table => Number((await db(table).count('* as count').first()).count)
async function assertNoMeeting() {
  assert.equal(await count('meetings'), 0)
  assert.equal(await count('meeting_participants'), 0)
  assert.equal(await count('voice_participants'), 0)
  assert.equal(await count('channels'), 1)
  assert.equal(events.some(event => event.name === 'meetings'), false)
}

test('ringing creates only a shared attempt and scoped invitations', async () => {
  const call = await start()
  assert.equal(call.created_new, true)
  assert.equal(call.status, 'ringing')
  assert.equal(new Date(call.expires_at).getTime(), clock + 30_000)
  await assertNoMeeting()
  assert.equal(await count('messages'), 0)
  assert.equal(await count('notifications'), 2)
  const again = await start()
  assert.equal(again.id, call.id)
  assert.equal(again.created_new, false)
  assert.equal((await calls.create({ source_channel_id: 'source' }, params('alice'))).id, call.id)
  assert.equal(await count('notifications'), 2)
  await assert.rejects(calls.get(call.id, params('outsider')), { code: 403 })
  assert.deepEqual(await calls.find(params('outsider')), [])
})

test('first acceptance starts exactly one meeting at acceptance time; remaining users keep their deadline', async () => {
  const call = await start()
  clock += 7000
  const accepted = await calls.patch(call.id, { action: 'accept' }, params('alice'))
  assert.equal(accepted.accepted_now, true)
  assert.equal(accepted.status, 'accepted')
  assert.equal(new Date(accepted.expires_at).getTime(), new Date(call.expires_at).getTime())
  const meeting = await db('meetings').first()
  assert.equal(new Date(meeting.started_at).getTime(), clock)
  assert.equal(await count('meetings'), 1)
  assert.equal(await count('messages'), 1)
  assert.equal((await db('messages').first()).content, `[Meeting] /meetings/${meeting.id}`)
  assert.equal((await calls.get(call.id, params('bob'))).recipient_status, 'invited')
  assert.equal(events.filter(event => event.name === 'meetings' && event.event === 'invited').length, 0)
  const later = await calls.patch(call.id, { action: 'accept' }, params('bob'))
  assert.equal(later.meeting_id, meeting.id)
  assert.equal(await count('messages'), 1)
  assert.equal(await count('notifications'), 2)
})

test('concurrent acceptance on two devices grants automatic entry once', async () => {
  const call = await start()
  const results = await Promise.all([1, 2].map(() => calls.patch(call.id, { action: 'accept' }, params('alice'))))
  assert.equal(new Set(results.map(result => result.meeting_id)).size, 1)
  assert.equal(results.filter(result => result.accepted_now).length, 1)
  assert.equal(await count('meetings'), 1)
  assert.equal(await count('messages'), 1)
})

test('concurrent acceptance by group members creates one meeting', async () => {
  const call = await start()
  const results = await Promise.all(['alice', 'bob'].map(id => calls.patch(call.id, { action: 'accept' }, params(id))))
  assert.equal(results[0].meeting_id, results[1].meeting_id)
  assert.equal(await count('meetings'), 1)
})

test('all declines create one history entry and no meeting', async () => {
  const call = await start()
  await calls.patch(call.id, { action: 'decline' }, params('alice'))
  assert.equal(await count('messages'), 0)
  await calls.patch(call.id, { action: 'decline' }, params('bob'))
  await calls.expire()
  await assertNoMeeting()
  assert.equal(await count('messages'), 1)
  assert.equal((await db('messages').first()).call_outcome, 'declined')
  await assert.rejects(calls.patch(call.id, { action: 'accept' }, params('alice')), { code: 400 })
})

test('timeout is enforced on accept without waiting for the sweep and survives restart', async () => {
  const call = await start()
  clock += 30_000
  await assert.rejects(calls.patch(call.id, { action: 'accept' }, params('alice')), { code: 400 })
  const restarted = new MeetingCallsService(app, { now: () => new Date(clock) })
  await restarted.expire()
  await restarted.expire()
  await assertNoMeeting()
  assert.equal(await count('messages'), 1)
  assert.equal((await db('messages').first()).call_outcome, 'expired')
})

test('expiry preserves a started meeting and closes outstanding group invitations', async () => {
  const call = await start()
  await calls.patch(call.id, { action: 'accept' }, params('alice'))
  clock += 30_001
  await calls.expire()
  assert.equal((await db('meetings').first()).status, 'active')
  assert.equal((await calls.get(call.id, params('bob'))).recipient_status, 'expired')
  assert.equal(await count('messages'), 1)
})

test('cancel against accept produces either a meeting or a cancelled attempt, never both', async () => {
  const call = await start()
  await Promise.allSettled([
    calls.patch(call.id, { action: 'cancel' }, params('caller')),
    calls.patch(call.id, { action: 'accept' }, params('alice'))
  ])
  const result = await calls.get(call.id, params('caller'))
  assert.ok(['accepted', 'cancelled'].includes(result.status))
  assert.equal(await count('meetings'), result.status === 'accepted' ? 1 : 0)
  assert.equal(await count('messages'), 1)
  assert.equal((await db('messages').first()).call_outcome, result.status)
})

test('only caller can cancel and removed recipients cannot accept', async () => {
  const call = await start()
  await assert.rejects(calls.patch(call.id, { action: 'cancel' }, params('alice')), { code: 403 })
  await db('channel_members').where('user_id', 'alice').delete()
  await assert.rejects(calls.patch(call.id, { action: 'accept' }, params('alice')), { code: 403 })
  await calls.patch(call.id, { action: 'cancel' }, params('caller'))
  await assertNoMeeting()
})

test('failed meeting creation rolls back acceptance and permits retry', async () => {
  const call = await start()
  await db.raw("ALTER TABLE meeting_participants ADD CONSTRAINT synthetic_insert_failure CHECK (user_id <> 'alice')")
  try {
    await assert.rejects(calls.patch(call.id, { action: 'accept' }, params('alice')), /synthetic_insert_failure/)
  } finally {
    await db.raw('ALTER TABLE meeting_participants DROP CONSTRAINT synthetic_insert_failure')
  }
  await assertNoMeeting()
  assert.equal((await calls.get(call.id, params('alice'))).recipient_status, 'invited')
  assert.equal((await calls.patch(call.id, { action: 'accept' }, params('alice'))).status, 'accepted')
})

test('external direct creation requires calling, but notes, channels and scheduled meetings start normally', async () => {
  await assert.rejects(meetings.create({ source_channel_id: 'source' }, params('caller')), { code: 400 })
  await db('channels').insert({ id: 'notes', name: 'notes', type: 'dm', created_by: 'caller' })
  await db('channel_members').insert({ id: 'notes-member', channel_id: 'notes', user_id: 'caller' })
  assert.equal((await meetings.create({ source_channel_id: 'notes' }, params('caller'))).status, 'active')
  assert.equal((await meetings.create({ source_channel_id: 'source', scheduled_start_at: new Date(clock + 60_000).toISOString() }, params('caller'))).status, 'scheduled')
  await db('channels').where('id', 'source').update({ type: 'private' })
  assert.equal((await meetings.create({ source_channel_id: 'source' }, params('caller'))).status, 'active')
})

test('registered HTTP service preserves authentication, validation and framework publishers', async t => {
  const api = koa(feathers())
  api.use(errorHandler())
  api.use(bodyParser())
  api.configure(rest())
  api.configure(socketio())
  api.set('postgresqlClient', db)
  api.set('authentication', {
    entity: 'user', service: 'users', secret: 'isolated-call-test-secret', authStrategies: ['jwt', 'local'],
    jwtOptions: { audience: 'https://calls.invalid', algorithm: 'HS256', expiresIn: '1h' },
    local: { usernameField: 'email', passwordField: 'password' }
  })
  api.use('users', new KnexService({ Model: db, name: 'users', paginate: false }))
  for (const name of ['messages', 'notifications', 'channels', 'voice']) api.use(name, { async create(data) { return data } })
  authentication(api)
  registerMeetings(api)
  meetingCalls(api)
  api.service('meeting-calls').publish(() => null)
  api.service('meeting-calls').publish('changed', payload => payload.userIds.map(id => api.channel(`user/${id}`)))
  const server = await api.listen(0, '127.0.0.1')
  t.after(() => api.teardown())
  if (!server.listening) await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/meeting-calls`
  const tokens = {}
  for (const id of ['caller', 'alice', 'outsider']) tokens[id] = await api.service('authentication').createAccessToken({ sub: id, auth_version: 1 })
  const request = (method, path, data, id) => fetch(`${url}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tokens[id] ? { Authorization: `Bearer ${tokens[id]}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  })
  assert.equal((await request('GET', '')).status, 401)
  const sanitized = await request('POST', '', { source_channel_id: 'source', meeting_id: 'forged' }, 'caller')
  assert.equal(sanitized.status, 201)
  assert.equal((await sanitized.json()).meeting_id, null)
  assert.equal(await count('meetings'), 0)
  assert.equal((await request('POST', '', { source_channel_id: '' }, 'caller')).status, 400)
  const created = await request('POST', '', { source_channel_id: 'source' }, 'caller')
  assert.equal(created.status, 201)
  const call = await created.json()
  assert.equal((await request('GET', `/${call.id}`, null, 'outsider')).status, 403)
  assert.equal((await request('PATCH', `/${call.id}`, { action: 'invalid' }, 'alice')).status, 400)
  const accepted = await request('PATCH', `/${call.id}`, { action: 'accept' }, 'alice')
  assert.equal(accepted.status, 200)
  assert.ok((await accepted.json()).meeting_id)
})

test('a group member joining an existing meeting stops that invitation on every device', async () => {
  const call = await start()
  const accepted = await calls.patch(call.id, { action: 'accept' }, params('alice'))
  await calls.recordJoin(accepted.meeting_id, 'bob')
  assert.equal((await calls.get(call.id, params('bob'))).recipient_status, 'accepted')
  assert.equal(await count('messages'), 1)
})

test('post-commit event failures do not reject a successfully accepted call', async () => {
  const call = await start()
  calls.emit = () => { throw new Error('synthetic socket failure') }
  const accepted = await calls.patch(call.id, { action: 'accept' }, params('alice'))
  assert.equal(accepted.accepted_now, true)
  assert.equal(await count('meetings'), 1)
  assert.equal(await count('messages'), 1)
})

test('concurrent acceptance fills the connection pool without requesting nested connections', async () => {
  const attempts = []
  for (let index = 0; index < 8; index++) {
    const id = `parallel-${index}`
    await db('channels').insert({ id, name: id, type: 'dm', created_by: 'caller' })
    await db('channel_members').insert(['caller', 'alice'].map(user_id => ({ id: `${id}-${user_id}`, channel_id: id, user_id })))
    attempts.push(await calls.create({ source_channel_id: id }, params('caller')))
  }
  const results = await Promise.all(attempts.map(call => calls.patch(call.id, { action: 'accept' }, params('alice'))))
  assert.equal(new Set(results.map(result => result.meeting_id)).size, 8)
})

test('an already active meeting is returned without another attempt', async () => {
  const call = await start()
  const accepted = await calls.patch(call.id, { action: 'accept' }, params('alice'))
  const result = await calls.create({ source_channel_id: 'source' }, params('caller'))
  assert.equal(result.meeting_id, accepted.meeting_id)
  assert.equal(await count('meeting_calls'), 1)
})
