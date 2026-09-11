import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { KnexService } from '@feathersjs/knex'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { authentication } from '../src/authentication.js'
import { meetings } from '../src/services/meetings/meetings.js'
import { RoomServiceClient } from 'livekit-server-sdk'

let fixture, db
before(async () => { fixture = await createPostgresTestDb(); db = fixture.db })
after(async () => fixture?.close())
beforeEach(async () => {
  await db('notifications').delete()
  await db('meetings').delete()
  await db('channels').delete()
  await db('users').delete()
  await db('users').insert(['host', 'invited', 'late', 'outsider'].map(id => ({
    id, email: `${id}@ap04.invalid`, display_name: id, password: 'unused', webauthn_user_id: id
  })))
  await db('channels').insert({ id: 'source', name: 'Source', type: 'private', meeting_history_access: 'meeting_start_members' })
  await db('channel_members').insert(['host', 'invited'].map(id => ({ id: `source-${id}`, channel_id: 'source', user_id: id })))
})

async function harness(t) {
  const app = feathers()
  app.set('postgresqlClient', db)
  app.set('authentication', {
    entity: 'user', service: 'users', secret: 'synthetic-ap04-secret', authStrategies: ['jwt', 'local'],
    jwtOptions: { audience: 'https://ap04.invalid', algorithm: 'HS256', expiresIn: '1h' },
    local: { usernameField: 'email', passwordField: 'password' }
  })
  app.use('users', new KnexService({ Model: db, name: 'users', paginate: false }))
  const events = [], observations = [], failures = { voice: false }
  app.use('voice', {
    async create(data) {
      const meeting = await db('meetings').where('chat_channel_id', data.channel_id).first()
      observations.push({ step: 'voice', status: meeting.status, participants: await db('meeting_participants').where('meeting_id', meeting.id) })
      if (failures.voice) throw new Error('synthetic voice failure')
      return { channelId: data.channel_id, token: 'synthetic', url: 'https://media.invalid' }
    },
    async patch(id, data) { observations.push({ step: 'voice-patch', id, data }); return data }
  })
  for (const name of ['channels', 'notifications', 'messages']) app.use(name, { async create(data) { return data } })
  authentication(app)
  meetings(app)
  const service = app.service('meetings')
  for (const event of ['created', 'invited', 'joined', 'ended', 'artifacts-queued']) {
    service.on(event, payload => { events.push({ event, payload }); observations.push({ step: event }) })
  }
  app.service('notifications').on('created', payload => events.push({ event: 'notification', payload }))
  app.service('channels').on('patched', payload => events.push({ event: 'channel', payload }))
  await app.setup()
  t.after(() => app.teardown())
  async function paramsFor(id) {
    const accessToken = await app.service('authentication').createAccessToken({ sub: id, auth_version: 1 })
    return { provider: 'rest', authentication: { strategy: 'jwt', accessToken } }
  }
  return { app, service, events, observations, failures, paramsFor, params: await paramsFor('host') }
}
function scheduledData() {
  return { source_channel_id: 'source', initial_user_ids: ['invited'], scheduled_start_at: new Date(Date.now() + 3600000).toISOString() }
}
async function snapshot() {
  const tables = ['meetings', 'channels', 'channel_members', 'meeting_participants', 'meeting_start_members', 'notifications', 'meeting_invite_links', 'meeting_artifacts', 'meeting_recording_pauses']
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, await db(table).orderBy('id')])))
}
async function failWrite(t, table, operation = 'INSERT OR UPDATE') {
  await db.raw("CREATE FUNCTION ap04_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic AP-04 database failure'; END $$")
  assert.ok(['INSERT OR UPDATE', 'DELETE'].includes(operation))
  await db.raw(`CREATE TRIGGER ap04_fail_write BEFORE ${operation} ON ?? FOR EACH ROW EXECUTE FUNCTION ap04_fail_write()`, [table])
  t.after(async () => {
    await db.raw('DROP TRIGGER IF EXISTS ap04_fail_write ON ??', [table])
    await db.raw('DROP FUNCTION IF EXISTS ap04_fail_write()')
  })
}

test('registered create preserves scheduled state, invitations and membership', async t => {
  const h = await harness(t)
  const result = await h.service.create(scheduledData(), h.params)
  assert.equal(result.status, 'scheduled')
  assert.equal((await db('meeting_participants').where('meeting_id', result.id)).length, 2)
  assert.equal((await db('meeting_start_members').where('meeting_id', result.id)).length, 0)
  assert.equal((await db('notifications').where('meeting_id', result.id)).length, 1)
  assert.equal(h.events.filter(e => e.event === 'invited').length, 1)
})

test('registered join activates and snapshots atomically before voice and joined event', async t => {
  const h = await harness(t)
  const meeting = await h.service.create(scheduledData(), h.params)
  h.observations.length = 0
  const result = await h.service.patch(meeting.id, { action: 'join', muted: true }, h.params)
  assert.equal(result.meeting.status, 'active')
  assert.equal((await db('meeting_start_members').where('meeting_id', meeting.id)).length, 2)
  assert.deepEqual(h.observations.map(o => o.step), ['voice', 'voice-patch', 'joined'])
  assert.equal(h.observations[0].status, 'active')
  assert.equal(h.observations[0].participants.find(p => p.user_id === 'host').invite_status, 'joined')
  await db('channel_members').insert({ id: 'source-late', channel_id: 'source', user_id: 'late' })
  const late = await h.service.patch(meeting.id, { action: 'join' }, await h.paramsFor('late'))
  assert.equal(late.meeting.id, meeting.id)
  assert.equal((await db('meeting_start_members').where({ meeting_id: meeting.id, user_id: 'late' })).length, 0)
  await assert.rejects(h.service.patch(meeting.id, { action: 'join' }, await h.paramsFor('outsider')), error => error.code === 403)
})

test('voice failure after join commit preserves activation without publishing joined', async t => {
  const h = await harness(t)
  const meeting = await h.service.create(scheduledData(), h.params)
  h.events.length = 0
  h.failures.voice = true
  await assert.rejects(h.service.patch(meeting.id, { action: 'join' }, h.params), /synthetic voice failure/)
  assert.equal((await db('meetings').where('id', meeting.id).first()).status, 'active')
  assert.equal((await db('meeting_participants').where({ meeting_id: meeting.id, user_id: 'host' }).first()).invite_status, 'joined')
  assert.deepEqual(h.events, [])
})

for (const action of ['create', 'join', 'invite', 'end', 'cancel']) {
  test(`registered ${action} rolls back every relation and emits nothing on database failure`, async t => {
    const h = await harness(t)
    let meeting
    if (action !== 'create') meeting = await h.service.create(action === 'end' ? { source_channel_id: 'source', initial_user_ids: ['invited'] } : scheduledData(), h.params)
    h.events.length = 0
    const initial = await snapshot()
    const table = { create: 'notifications', join: 'meeting_start_members', invite: 'notifications', end: 'channels', cancel: 'channels' }[action]
    await failWrite(t, table)
    await assert.rejects(action === 'create' ? h.service.create(scheduledData(), h.params) : h.service.patch(meeting.id, { action, ...(action === 'invite' ? { user_ids: ['late'] } : {}) }, h.params), /synthetic AP-04 database failure/)
    assert.deepEqual(await snapshot(), initial)
    assert.deepEqual(h.events, [])
    assert.deepEqual(h.observations.filter(o => o.step === 'voice'), [])
  })
}

test('registered invite deduplicates existing invitees and cancel revokes guest links', async t => {
  const h = await harness(t)
  const meeting = await h.service.create(scheduledData(), h.params)
  await h.service.patch(meeting.id, { action: 'invite', user_ids: ['late', 'invited', 'late'] }, h.params)
  assert.equal((await db('notifications').where({ meeting_id: meeting.id, user_id: 'late' })).length, 1)
  await h.service.patch(meeting.id, { action: 'create_invite_link' }, h.params)
  const cancelled = await h.service.patch(meeting.id, { action: 'cancel' }, h.params)
  assert.equal(cancelled.status, 'cancelled')
  assert.equal((await db('channels').where('id', meeting.chat_channel_id).first()).is_archived, true)
  assert.equal((await db('meeting_invite_links').where('meeting_id', meeting.id).whereNull('revoked_at')).length, 0)
  assert.equal(h.events.at(-1).payload.status, 'cancelled')
})

test('registered end commits and emits its terminal payload before room cleanup', async t => {
  const h = await harness(t)
  const meeting = await h.service.create({ source_channel_id: 'source', initial_user_ids: ['invited'] }, h.params)
  h.events.length = 0
  let cleanupObserved = false
  t.mock.method(RoomServiceClient.prototype, 'deleteRoom', async channelId => {
    assert.equal(channelId, meeting.chat_channel_id)
    assert.equal((await db('meetings').where('id', meeting.id).first()).status, 'ended')
    assert.equal((await db('channels').where('id', channelId).first()).is_archived, true)
    assert.deepEqual(h.events.map(entry => entry.event), ['ended'])
    cleanupObserved = true
    throw new Error('synthetic room cleanup failure')
  })
  const ended = await h.service.patch(meeting.id, { action: 'end' }, h.params)
  assert.equal(ended.status, 'ended')
  assert.equal(cleanupObserved, true)
  assert.equal((await db('meeting_participants').where('meeting_id', meeting.id).whereNotNull('left_at')).length, 1)
  assert.equal((await db('meeting_participants').where({ meeting_id: meeting.id, user_id: 'invited' }).first()).left_at, null)
  assert.deepEqual(h.events.map(entry => entry.event), ['ended', 'channel'])
  assert.deepEqual(h.events[0].payload, {
    meetingId: meeting.id, chatChannelId: meeting.chat_channel_id, endedAt: new Date(ended.ended_at).toISOString(),
    sourceChannelId: 'source',
    endedBy: 'host', status: 'ended', chatChannelArchived: true
  })
})

test('voice-row failure after end commit does not suppress its confirmed end event', async t => {
  const h = await harness(t)
  const meeting = await h.service.create({ source_channel_id: 'source' }, h.params)
  await db('voice_participants').insert({ id: 'voice-host', channel_id: meeting.chat_channel_id, user_id: 'host' })
  h.events.length = 0
  await failWrite(t, 'voice_participants', 'DELETE')
  assert.equal((await h.service.patch(meeting.id, { action: 'end' }, h.params)).status, 'ended')
  assert.equal((await db('meetings').where('id', meeting.id).first()).status, 'ended')
  assert.equal((await db('channels').where('id', meeting.chat_channel_id).first()).is_archived, true)
  assert.deepEqual(h.events.map(entry => entry.event), ['ended', 'channel'])
})
