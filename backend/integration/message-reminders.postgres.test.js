import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler } from '@feathersjs/koa'
import { KnexService } from '@feathersjs/knex'
import knex from 'knex'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { processDueMessageReminders } from '../src/services/message-reminders/processor.js'
import { MessageRemindersService, messageReminders } from '../src/services/message-reminders/message-reminders.js'
import { authentication } from '../src/authentication.js'
import { createNotificationSideEffectsDispatcher } from '../src/lib/notification-side-effects.js'
import { up as recover, down as undoRecovery } from '../migrations/071_message_reminder_recovery.js'

const now = new Date('2026-09-08T10:00:00.000Z')
const future = '2026-09-08T11:00:00.000Z'
let fixture, db, enqueued, errors, app, service
const params = { user: { id: 'alice' } }
before(async () => { fixture = await createPostgresTestDb(); db = fixture.db })
after(async () => { await fixture?.close() })

async function seed(client) {
  await client('users').insert([
    { id: 'alice', email: 'alice@test.invalid', password: 'unused', display_name: 'Alice', preferred_locale: 'de', webauthn_user_id: 'alice-key' },
    { id: 'bob', email: 'bob@test.invalid', password: 'unused', display_name: 'Bob', webauthn_user_id: 'bob-key' }
  ])
  await client('channels').insert({ id: 'chat', name: 'Chat', type: 'private' })
  await client('channel_members').insert({ id: 'member', user_id: 'alice', channel_id: 'chat' })
  await client('messages').insert({ id: 'message', user_id: 'bob', channel_id: 'chat', content: 'Remember me' })
}

beforeEach(async () => {
  await db('messages').delete()
  await db('channels').delete()
  await db('users').delete()
  await seed(db)
  enqueued = []; errors = []
  app = feathers()
  app.set('postgresqlClient', db)
  app.set('notificationSideEffectsDispatcher', { enqueue: (rows) => { enqueued.push(...rows) } })
  service = new MessageRemindersService({ Model: db, clock: () => now })
})

async function reminder(data = {}, client = db) {
  const row = { id: 'reminder', user_id: 'alice', message_id: 'message', channel_id: 'chat', remind_at: now, status: 'active', ...data }
  await client('message_reminders').insert(row)
  return row
}
const run = (options = {}) => processDueMessageReminders(app, { now, log: { error: (...args) => errors.push(args) }, ...options })
const stored = () => db('message_reminders').where('id', 'reminder').first()
const notifications = () => db('notifications').where('type', 'message_reminder')

function barrier() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

// Pause a real transaction after its writes, before Knex commits it.
function pausedClient(t, workerDb = db) {
  const entered = barrier(), release = barrier()
  let pid
  const client = new Proxy(workerDb, { get(target, key) {
    if (key !== 'transaction') return Reflect.get(target, key)
    return (callback) => workerDb.transaction(async (trx) => {
      pid = (await trx.raw('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const result = await callback(trx)
      entered.resolve()
      await release.promise
      return result
    })
  } })
  t.after(() => release.resolve())
  return { client, entered, release, get pid() { return pid } }
}

async function waitForLock() {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const { rows } = await db.raw(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE '%message_reminders%'`)
    if (rows.length) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected competing PostgreSQL lock was not observed')
}

test('two real processors skip the locked reminder and enqueue only after visible commit', async (t) => {
  await reminder()
  const paused = pausedClient(t)
  app.set('postgresqlClient', paused.client)
  const first = run()
  await paused.entered.promise
  app.set('postgresqlClient', db)
  assert.deepEqual(await run(), { processed: 1, delivered: 0, skipped: 0 })
  assert.equal((await notifications()).length, 0)
  assert.equal(enqueued.length, 0)
  app.set('notificationSideEffectsDispatcher', { async enqueue(rows) {
    assert.ok(await db('notifications').where('id', rows[0].id).first())
    enqueued.push(...rows)
  } })
  paused.release.resolve()
  assert.equal((await first).delivered, 1)
  assert.equal((await run()).delivered, 0)
  assert.equal(enqueued.length, 1)
})

test('terminating the worker connection before commit permits a new worker to deliver', async (t) => {
  await reminder()
  const workerDb = knex({ client: 'pg', connection: db.client.config.connection, pool: { min: 0, max: 1 } })
  t.after(() => workerDb.destroy())
  const paused = pausedClient(t, workerDb)
  app.set('postgresqlClient', paused.client)
  const first = run()
  await paused.entered.promise
  assert.equal((await notifications()).length, 0)
  await db.raw('SELECT pg_terminate_backend(?)', [paused.pid])
  paused.release.resolve()
  assert.equal((await first).delivered, 0)
  assert.equal((await stored()).status, 'active')
  app.set('postgresqlClient', db)
  assert.equal((await run()).delivered, 1)
  assert.equal((await notifications()).length, 1)
})

for (const method of ['patch', 'remove', 'create']) {
  for (const workerFirst of [false, true]) {
    test(`${method} competing with delivery: ${workerFirst ? 'worker' : 'service'} wins first`, async (t) => {
      await reminder()
      const paused = pausedClient(t)
      const change = (instance) => method === 'create'
        ? instance.create({ message_id: 'message', remind_at: future }, params)
        : method === 'patch' ? instance.patch('reminder', { remind_at: future }, params)
          : instance.remove('reminder', params)
      if (workerFirst) {
        app.set('postgresqlClient', paused.client)
        const first = run()
        await paused.entered.promise
        const second = change(service)
        const resultsPromise = Promise.allSettled([first, second])
        try { await waitForLock() } finally { paused.release.resolve() }
        const results = await resultsPromise
        assert.equal(results[0].value.delivered, 1)
        if (method === 'create') {
          assert.equal(results[1].status, 'fulfilled')
          assert.notEqual(results[1].value.id, 'reminder')
          assert.equal(results[1].value.status, 'active')
        } else {
          assert.equal(results[1].status, 'rejected')
          assert.equal(results[1].reason.data.error_code, 'api.message_reminders.not_found')
        }
        assert.equal((await notifications()).length, 1)
      } else {
        const first = change(new MessageRemindersService({ Model: paused.client, clock: () => now }))
        await paused.entered.promise
        assert.equal((await run()).delivered, 0)
        paused.release.resolve()
        const result = await first
        assert.equal(result.id, 'reminder')
        assert.equal((await run()).delivered, 0)
        assert.equal((await notifications()).length, 0)
        assert.equal((await stored()).status, method === 'remove' ? 'cancelled' : 'active')
      }
    })
  }
}

test('concurrent creates without an existing row share one active ID', async (t) => {
  const paused = pausedClient(t)
  const first = new MessageRemindersService({ Model: paused.client, clock: () => now })
    .create({ message_id: 'message', remind_at: future }, params)
  await paused.entered.promise
  const second = service.create({ message_id: 'message', remind_at: '2026-09-08T12:00:00Z' }, params)
  const resultsPromise = Promise.all([first, second])
  try { await waitForLock() } finally { paused.release.resolve() }
  const results = await resultsPromise
  assert.equal(results[0].id, results[1].id)
  assert.equal((await db('message_reminders')).length, 1)
  assert.equal(new Date(results[1].remind_at).toISOString(), '2026-09-08T12:00:00.000Z')
})

test('due boundary, limit and second run preserve one committed notification per reminder', async () => {
  await reminder()
  assert.deepEqual(await run({ now: new Date(now.getTime() - 1) }), { processed: 0, delivered: 0, skipped: 0 })
  assert.equal((await run({ limit: 0 })).processed, 0)
  assert.deepEqual(await run(), { processed: 1, delivered: 1, skipped: 0 })
  assert.equal((await run()).delivered, 0)
  const rows = await notifications()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].actor_display_name, 'Erinnerung')
  assert.equal(rows[0].message_snippet, 'Remember me')
  assert.equal(rows[0].created_at.toISOString(), now.toISOString())
  assert.equal((await stored()).notification_id, rows[0].id)
  assert.equal(enqueued.length, 1)
  await db('notifications').delete()
  assert.equal((await stored()).notification_id, null)
  assert.equal((await run()).delivered, 0)
})

async function failingTrigger(t, deferred) {
  await db.raw(`CREATE FUNCTION ap02_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic reminder failure' USING ERRCODE = '23514'; END $$`)
  const table = deferred ? 'notifications' : 'message_reminders'
  await db.raw(`${deferred
    ? 'CREATE CONSTRAINT TRIGGER ap02_fail AFTER INSERT ON ?? DEFERRABLE INITIALLY DEFERRED'
    : 'CREATE TRIGGER ap02_fail BEFORE UPDATE ON ??'} FOR EACH ROW EXECUTE FUNCTION ap02_fail()`, [table])
  const cleanup = async () => {
    await db.raw('DROP TRIGGER IF EXISTS ap02_fail ON ??', [table])
    await db.raw('DROP FUNCTION IF EXISTS ap02_fail()')
  }
  t.after(cleanup)
  return cleanup
}

for (const deferred of [false, true]) {
  test(`failure ${deferred ? 'at commit' : 'after insert'} rolls back both rows and retries`, async (t) => {
    await reminder()
    const cleanup = await failingTrigger(t, deferred)
    assert.equal((await run()).delivered, 0)
    assert.equal((await stored()).status, 'active')
    assert.equal((await notifications()).length, 0)
    assert.equal(enqueued.length, 0)
    assert.equal(errors.length, 1)
    await cleanup()
    assert.equal((await run()).delivered, 1)
    assert.equal((await run()).delivered, 0)
  })
}

for (const kind of ['deleted', 'membership', 'disabled-admin', 'pending', 'guest-expired']) {
  test(`access revoked: ${kind} cancels without delivery and service rejects stale user params`, async () => {
    await reminder()
    if (kind === 'deleted') await db('messages').update({ deleted_at: now })
    if (kind === 'membership') await db('channel_members').delete()
    if (kind === 'disabled-admin') await db('users').where('id', 'alice').update({ disabled_at: now, is_admin: true })
    if (kind === 'pending') await db('users').where('id', 'alice').update({ registration_status: 'pending' })
    if (kind === 'guest-expired') await db('users').where('id', 'alice').update({ account_type: 'guest', guest_expires_at: now })
    await assert.rejects(service.create({ message_id: 'message', remind_at: future }, params))
    assert.deepEqual(await run(), { processed: 1, delivered: 0, skipped: 1 })
    assert.equal((await stored()).status, 'cancelled')
    assert.equal((await notifications()).length, 0)
    assert.equal(enqueued.length, 0)
    assert.equal(errors.length, 0)
  })
}

for (const allowed of [false, true]) {
  test(`ended meeting history ${allowed ? 'allows' : 'denies'} the reminder in service and worker`, async () => {
    await db('channels').insert({ id: 'source', name: 'Source', type: 'private', meeting_history_access: 'active_participants' })
    await db('channel_members').insert({ id: 'source-member', channel_id: 'source', user_id: 'alice' })
    await db('channels').where('id', 'chat').update({ purpose: 'meeting' })
    await db('meetings').insert({ id: 'meeting', source_channel_id: 'source', chat_channel_id: 'chat', host_user_id: 'bob', status: 'ended', language: 'de' })
    if (allowed) {
      await db('meeting_participants').insert({ id: 'participant', meeting_id: 'meeting', user_id: 'alice', joined_at: now })
      await db('channel_members').delete()
      await service.create({ message_id: 'message', remind_at: future }, params)
      await db('message_reminders').delete()
    } else {
      await assert.rejects(service.create({ message_id: 'message', remind_at: future }, params), (error) => error.code === 403)
    }
    await reminder()
    const result = await run()
    assert.equal(result.delivered, allowed ? 1 : 0)
    assert.equal(result.skipped, allowed ? 0 : 1)
  })
}

test('technical access query failures roll back rather than cancel', async (t) => {
  await reminder()
  // A database error in the real access query, not an authorization denial.
  await db.raw('ALTER TABLE channel_members RENAME TO ap02_hidden_members')
  t.after(() => db.raw('ALTER TABLE ap02_hidden_members RENAME TO channel_members'))
  assert.equal((await run()).skipped, 0)
  assert.equal((await stored()).status, 'active')
  assert.equal(errors.length, 1)
})

for (const failure of ['enqueue', 'absent']) {
  test(`post-commit ${failure} leaves the durable notification and never retries dispatch`, async () => {
    await reminder()
    app.set('notificationSideEffectsDispatcher', failure === 'absent' ? null : { enqueue() { throw new Error('dispatch unavailable') } })
    assert.equal((await run()).delivered, 1)
    app.set('notificationSideEffectsDispatcher', { enqueue: (rows) => enqueued.push(...rows) })
    assert.equal((await run()).delivered, 0)
    assert.equal((await notifications()).length, 1)
    assert.equal(enqueued.length, 0)
  })
}

test('service validates dates, preserves active ID and scopes reads and changes to owner', async () => {
  for (const remind_at of ['invalid', now.toISOString()]) {
    await assert.rejects(service.create({ message_id: 'message', remind_at }, params), (error) => error.code === 400)
  }
  const first = await service.create({ message_id: 'message', remind_at: future }, params)
  const second = await service.create({ message_id: 'message', remind_at: '2026-09-08T12:00:00Z' }, params)
  assert.equal(first.id, second.id)
  assert.equal((await service.find(params)).length, 1)
  const other = { user: { id: 'bob' } }
  assert.deepEqual(await service.find(other), [])
  await assert.rejects(service.patch(first.id, { remind_at: future }, other), (error) => error.code === 404)
  await assert.rejects(service.remove(first.id, other), (error) => error.code === 404)
  assert.equal((await service.patch(first.id, { remind_at: future }, params)).status, 'active')
  assert.equal((await service.remove(first.id, params)).status, 'cancelled')
  assert.equal((await service.find({ ...params, query: { status: 'cancelled' } })).length, 1)
  await assert.rejects(service.find({ ...params, query: { status: 'processing' } }), (error) => error.code === 400)
})

test('socket and push exceptions in the real dispatcher cannot duplicate the database notification', async () => {
  await reminder()
  app.use('notifications', { async find() { return [] } }, { events: ['created'] })
  let sockets = 0, pushes = 0
  app.service('notifications').on('created', () => { sockets++; throw new Error('socket failure') })
  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    schedule: () => {}, log: { error() {} },
    sendPush: async () => { pushes++; throw new Error('push failure') }
  })
  app.set('notificationSideEffectsDispatcher', dispatcher)
  assert.equal((await run()).delivered, 1)
  await dispatcher.flush()
  assert.equal(sockets, 1)
  assert.equal(pushes, 1)
  assert.equal((await run()).delivered, 0)
  assert.equal((await notifications()).length, 1)
})

test('a failed first candidate does not prevent the next candidate from committing', async () => {
  await reminder({ id: 'a-first' })
  await reminder({ id: 'b-second', user_id: 'bob' })
  await db('users').where('id', 'bob').update({ is_admin: true })
  let calls = 0
  assert.deepEqual(await run({ generateId: () => {
    if (++calls === 1) throw new Error('first candidate failure')
    return 'second-notification'
  } }), { processed: 2, delivered: 1, skipped: 0 })
  assert.equal((await db('message_reminders').where('id', 'a-first').first()).status, 'active')
  assert.equal((await db('message_reminders').where('id', 'b-second').first()).status, 'delivered')
  assert.equal(enqueued.length, 1)
})

test('upgrade from 070 recovers legacy processing deterministically and down never resurrects rows', async (t) => {
  const legacy = await createPostgresTestDb({ migrationTarget: '070_default_general_channel_memberships.js' })
  t.after(() => legacy.close())
  const client = legacy.db
  await seed(client)
  for (const id of ['conflict', 'linked', 'timestamp', 'orphan']) {
    await client('messages').insert({ id, channel_id: 'chat', user_id: 'bob', content: id })
  }
  const old = { status: 'processing', created_at: '2026-01-01T00:00:00Z' }
  await reminder({ ...old, id: 'older' }, client)
  await reminder({ ...old, id: 'newer-a', created_at: '2026-02-01T00:00:00Z' }, client)
  await reminder({ ...old, id: 'newer-z', created_at: '2026-02-01T00:00:00Z' }, client)
  await reminder({ ...old, id: 'conflict-old', message_id: 'conflict' }, client)
  await reminder({ id: 'active', message_id: 'conflict', remind_at: future }, client)
  const activeBefore = await client('message_reminders').where('id', 'active').first()
  await client('notifications').insert([
    { id: 'linked-notification', user_id: 'alice', type: 'message_reminder', message_id: 'linked', channel_id: 'chat', created_at: now },
    { id: 'unlinked-notification', user_id: 'alice', type: 'message_reminder', message_id: 'orphan', channel_id: 'chat', created_at: now }
  ])
  await reminder({ ...old, id: 'linked', message_id: 'linked', notification_id: 'linked-notification' }, client)
  await reminder({ ...old, id: 'timestamp', message_id: 'timestamp', delivered_at: now }, client)
  await reminder({ ...old, id: 'orphan', message_id: 'orphan' }, client)
  const [, migrated] = await client.migrate.up({ directory: fileURLToPath(new URL('../migrations/', import.meta.url)), name: '071_message_reminder_recovery.js' })
  assert.deepEqual(migrated, ['071_message_reminder_recovery.js'])
  const rows = Object.fromEntries((await client('message_reminders')).map((row) => [row.id, row]))
  assert.equal(rows.older.status, 'cancelled')
  assert.equal(rows['newer-a'].status, 'cancelled')
  assert.equal(rows['newer-z'].status, 'active')
  assert.equal(rows['conflict-old'].status, 'cancelled')
  assert.deepEqual(rows.active, activeBefore)
  assert.equal(rows.linked.status, 'delivered')
  assert.equal(rows.timestamp.status, 'delivered')
  assert.equal(rows.orphan.status, 'active')
  const oldApp = feathers()
  oldApp.set('postgresqlClient', client)
  assert.equal((await processDueMessageReminders(oldApp, { now })).delivered, 2)
  assert.equal((await processDueMessageReminders(oldApp, { now })).delivered, 0)
  assert.ok(await client('notifications').where('id', 'unlinked-notification').first())
  const beforeDown = await client('message_reminders').orderBy('id')
  await client.transaction(undoRecovery)
  await client.transaction(recover)
  assert.deepEqual(await client('message_reminders').orderBy('id'), beforeDown)
})

test('HTTP/JWT reminder API preserves authentication, ownership and response contracts', async (t) => {
  const api = koa(feathers())
  api.use(errorHandler()); api.use(bodyParser()); api.configure(rest())
  api.set('postgresqlClient', db)
  api.set('authentication', {
    entity: 'user', service: 'users', secret: 'synthetic-ap02-jwt-secret', authStrategies: ['jwt', 'local'],
    jwtOptions: { audience: 'https://test.invalid', algorithm: 'HS256', expiresIn: '1h' },
    local: { usernameField: 'email', passwordField: 'password' }
  })
  api.use('users', new KnexService({ Model: db, name: 'users', paginate: false }))
  authentication(api); messageReminders(api)
  api.service('message-reminders').clock = () => now
  const server = await api.listen(0, '127.0.0.1')
  if (!server.listening) await once(server, 'listening')
  t.after(() => api.teardown())
  const tokens = {}
  for (const id of ['alice', 'bob']) tokens[id] = await api.service('authentication').createAccessToken({ sub: id, auth_version: 1 })
  const request = (method, path = '', data, user = 'alice') => fetch(`http://127.0.0.1:${server.address().port}/message-reminders${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tokens[user] ? { Authorization: `Bearer ${tokens[user]}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  })
  const data = { message_id: 'message', remind_at: future }
  assert.equal((await request('POST', '', data, 'anonymous')).status, 401)
  assert.equal((await request('POST', '', data, 'bob')).status, 403)
  assert.equal((await request('POST', '', { ...data, remind_at: 'bad' })).status, 400)
  const created = await request('POST', '', data)
  assert.equal(created.status, 201)
  const row = await created.json()
  assert.equal(row.status, 'active'); assert.equal(row.notification_id, null)
  assert.equal((await request('PATCH', `/${row.id}`, { remind_at: future }, 'bob')).status, 404)
  assert.equal((await request('DELETE', `/${row.id}`, null, 'bob')).status, 404)
  assert.deepEqual(await (await request('GET', '', null, 'bob')).json(), [])
  assert.equal((await request('PATCH', `/${row.id}`, { remind_at: '2026-09-08T12:00:00Z' })).status, 200)
  assert.equal((await (await request('DELETE', `/${row.id}`)).json()).status, 'cancelled')
})
