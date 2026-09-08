import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { feathers } from '@feathersjs/feathers'
import { koa, rest, bodyParser, errorHandler } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import { io } from 'socket.io-client'
import { KnexService } from '@feathersjs/knex'
import { S3Client } from '@aws-sdk/client-s3'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { messages } from '../src/services/messages/messages.js'
import { authentication } from '../src/authentication.js'
import { channels } from '../src/channels.js'
import { createNotificationSideEffectsDispatcher } from '../src/lib/notification-side-effects.js'

let fixture
let db
before(async () => {
  fixture = await createPostgresTestDb()
  db = fixture.db
})
after(async () => { await fixture?.close() })

beforeEach(async () => {
  await db('search_documents').delete()
  await db('files').delete()
  await db('messages').delete()
  await db('channels').delete()
  await db('users').delete()
  await db('users').insert([
    { id: 'alice', email: 'alice@test.invalid', password: 'unused', display_name: 'Alice', webauthn_user_id: 'alice-webauthn' },
    { id: 'bob', email: 'bob@test.invalid', password: 'unused', display_name: 'Bob', webauthn_user_id: 'bob-webauthn' }
  ])
  await db('channels').insert([
    { id: 'target', name: 'Target', type: 'public' },
    { id: 'private', name: 'Private', type: 'private' }
  ])
  await db('channel_members').insert([
    { id: 'target-alice', channel_id: 'target', user_id: 'alice' },
    { id: 'target-bob', channel_id: 'target', user_id: 'bob' },
    { id: 'private-bob', channel_id: 'private', user_id: 'bob' }
  ])
  await db('messages').insert({ id: 'source', channel_id: 'private', user_id: 'bob', content: 'Private source', type: 'file' })
})

async function makeApp(t, { transports = false } = {}) {
  const app = transports ? koa(feathers()) : feathers()
  if (transports) {
    app.use(errorHandler())
    app.use(bodyParser())
    app.configure(rest())
    app.configure(socketio())
  }
  app.set('postgresqlClient', db)
  app.set('authentication', {
    entity: 'user', service: 'users', secret: 'synthetic-ap01-jwt-secret', authStrategies: ['jwt', 'local'],
    jwtOptions: { audience: 'https://test.invalid', algorithm: 'HS256', expiresIn: '1h' },
    local: { usernameField: 'email', passwordField: 'password' }
  })
  app.use('users', new KnexService({ Model: db, name: 'users', paginate: false }))
  authentication(app)
  messages(app)
  const signedKeys = []
  const signing = { error: null }
  const storage = new S3Client({
    endpoint: 'https://storage.invalid', region: 'us-east-1', forcePathStyle: true,
    credentials: async () => {
      if (signing.error) throw signing.error
      return { accessKeyId: 'synthetic-test-key', secretAccessKey: 'synthetic-test-secret' }
    }
  })
  storage.middlewareStack.add((next, context) => async (args) => {
    if (context.commandName === 'GetObjectCommand') signedKeys.push(args.input.Key)
    return next(args)
  }, { step: 'initialize', name: 'recordSignedTestKeys' })
  app.set('storagePresignClient', storage)
  const objects = { copied: [], deleted: [], copyErrorAt: null }
  app.set('storageClient', {
    async send(command) {
      if (command.constructor.name === 'CopyObjectCommand') {
        if (objects.copied.length + 1 === objects.copyErrorAt) throw new Error('Synthetic copy failure')
        objects.copied.push(command.input)
      } else if (command.constructor.name === 'DeleteObjectCommand') {
        objects.deleted.push(command.input)
      } else {
        throw new Error(`Unexpected storage operation ${command.constructor.name}`)
      }
      return {}
    }
  })
  const enqueued = []
  app.set('notificationSideEffectsDispatcher', { enqueue: (rows) => enqueued.push(...rows) })
  const events = []
  app.service('messages').on('created', (message, context) => events.push({ message, context }))
  t.after(async () => { storage.destroy(); await app.teardown() })
  let url
  if (transports) {
    // Only these services' publishers are needed; the production channel configuration is used unchanged.
    for (const name of ['channels', 'channel-members', 'roles', 'role-permissions', 'user-roles', 'invites', 'voice',
      'meetings', 'voice-message-artifacts', 'message-summaries', 'reactions', 'pinned-messages', 'notifications']) {
      app.use(name, { async find() { return [] } }, {
        events: ['created', 'participant-joined', 'participant-left', 'participant-updated', 'invited',
          'joined', 'ended', 'artifacts-queued', 'artifacts-updated', 'recording-state-updated']
      })
    }
    channels(app)
    const server = await app.listen(0, '127.0.0.1')
    if (!server.listening) await once(server, 'listening')
    url = `http://127.0.0.1:${server.address().port}`
  } else {
    await app.setup()
  }
  async function paramsFor(userId) {
    const token = await app.service('authentication').createAccessToken({ sub: userId, auth_version: 1 })
    return { provider: 'rest', authentication: { strategy: 'jwt', accessToken: token } }
  }
  const params = await paramsFor('alice')
  return { app, service: app.service('messages'), params, paramsFor, events, enqueued, signedKeys, signing, objects, url }
}

async function upload(id, userId = 'alice', messageId = null) {
  await db('files').insert({
    id, user_id: userId, message_id: messageId, original_name: `${id}.pdf`,
    storage_key: `${userId}/${id}/private.pdf`, mime_type: 'application/pdf', size: 123, bucket: 'test-files'
  })
}

test('external create rejects a foreign bound file without signing or persisting a message', async (t) => {
  const { service, params, events, signedKeys } = await makeApp(t)
  await upload('foreign-file', 'bob', 'source')
  await assert.rejects(service.create({ channel_id: 'target', content: 'Attempt', file_ids: ['foreign-file'] }, params),
    (error) => error.code === 400 && error.data?.error_code === 'api.messages.attachments_unavailable')
  assert.deepEqual(signedKeys, [])
  assert.deepEqual(events, [])
  assert.equal((await db('messages').select('id')).length, 1)
  assert.equal((await db('files').where('id', 'foreign-file').first()).message_id, 'source')
})

async function snapshot() {
  const names = ['messages', 'files', 'search_documents', 'mentions', 'notifications', 'channel_members']
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await db(name).orderBy('id')])))
}

function attachmentsUnavailable(error) {
  assert.equal(error.code, 400)
  assert.equal(error.data.error_code, 'api.messages.attachments_unavailable')
  assert.deepEqual(error.data, { error_code: 'api.messages.attachments_unavailable', error_params: {} })
  return true
}

for (const kind of ['foreign-free', 'foreign-bound', 'own-bound', 'missing', 'mixed', 'admin-foreign']) {
  test(`invalid attachment set: ${kind} leaves every database relation unchanged`, async (t) => {
    if (kind === 'admin-foreign') await db('users').where('id', 'alice').update({ is_admin: true })
    const harness = await makeApp(t)
    await upload('valid')
    await upload('foreign-free', 'bob')
    await upload('foreign-bound', 'bob', 'source')
    await upload('own-bound', 'alice', 'source')
    const ids = kind === 'mixed' ? ['valid', 'foreign-bound', 'missing']
      : [kind === 'admin-foreign' ? 'foreign-free' : kind]
    const initial = await snapshot()
    await assert.rejects(harness.service.create({ channel_id: 'target', content: '@Bob', file_ids: ids }, harness.params), attachmentsUnavailable)
    assert.deepEqual(await snapshot(), initial)
    assert.deepEqual(harness.signedKeys, [])
    assert.deepEqual(harness.events, [])
    assert.deepEqual(harness.enqueued, [])
  })
}

test('own uploads are linked, signed, sanitized and deduplicated in request order', async (t) => {
  const { service, params, events, signedKeys } = await makeApp(t)
  await upload('first')
  await upload('second')
  const result = await service.create({ channel_id: 'target', file_ids: ['second', 'first', 'second'] }, params)
  assert.equal(result.content, '')
  assert.equal(result.type, 'file')
  assert.deepEqual(result.files.map((file) => file.id), ['second', 'first'])
  assert.equal(signedKeys.length, 2)
  for (const file of result.files) {
    assert.equal(file.message_id, result.id)
    assert.equal(file.user_id, 'alice')
    assert.ok(new URL(file.url).searchParams.has('X-Amz-Signature'))
    assert.equal(file.storage_key, undefined)
    assert.equal(file.bucket, undefined)
    assert.equal((await db('files').where('id', file.id).first()).message_id, result.id)
  }
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].context.dispatch, result)
  assert.equal((await db('search_documents').where('document_type', 'file')).length, 2)
})

test('text creates and internal meeting messages keep their notification contracts', async (t) => {
  const { service, params, enqueued } = await makeApp(t)
  const result = await service.create({ channel_id: 'target', content: 'Hello @Bob', file_ids: [] }, params)
  assert.equal(result.type, 'text')
  assert.equal(result.files, undefined)
  assert.equal(result.mentions.length, 1)
  assert.equal(enqueued.length, 1)
  const meetingMessage = await service.create({ channel_id: 'target', content: '[Meeting] @Bob' }, {
    user: await db('users').where('id', 'alice').first(), skipNotifications: true
  })
  assert.ok(meetingMessage.id)
  assert.equal(enqueued.length, 1)
  assert.equal((await db('notifications').where('message_id', meetingMessage.id)).length, 0)
})

for (const fileIds of [[1], [''], 'valid', null]) {
  test(`attachment schema still rejects ${JSON.stringify(fileIds)}`, async (t) => {
    const { service, params } = await makeApp(t)
    const initial = await snapshot()
    await assert.rejects(service.create({ channel_id: 'target', content: 'Text', file_ids: fileIds }, params),
      (error) => error.data?.error_code === 'api.validation.failed')
    assert.deepEqual(await snapshot(), initial)
  })
}

test('authentication, target membership and send permission remain required', async (t) => {
  const { service, params, enqueued, signedKeys } = await makeApp(t)
  await upload('valid')
  const data = { channel_id: 'target', content: 'Hello', file_ids: ['valid'] }
  const initial = await snapshot()
  await assert.rejects(service.create({ ...data }, { provider: 'rest' }), (error) => error.code === 401)
  await assert.rejects(service.create({ ...data }, { provider: 'socketio', authentication: { strategy: 'jwt', accessToken: 'invalid' } }),
    (error) => error.code === 401)
  await assert.rejects(service.create({ ...data, channel_id: 'private' }, params),
    (error) => error.data?.error_code === 'api.channels.membership_required')
  const role = await db('roles').where('name', 'channel:member').first()
  const permission = await db('permissions').where('name', 'send_messages').first()
  const removed = await db('role_permissions').where({ role_id: role.id, permission_id: permission.id }).delete().returning('*')
  t.after(async () => { if (removed.length) await db('role_permissions').insert(removed) })
  await assert.rejects(service.create({ ...data }, params),
    (error) => error.data?.error_code === 'api.permissions.missing_required_permission')
  assert.deepEqual(await snapshot(), initial)
  assert.deepEqual(enqueued, [])
  assert.deepEqual(signedKeys, [])
})

async function installFailureTrigger(t, table, deferred = false) {
  await db.raw(`CREATE FUNCTION ap01_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic AP-01 database failure' USING ERRCODE = '23514'; END $$`)
  t.after(async () => {
    await db.raw('DROP TRIGGER IF EXISTS ap01_fail_write ON ??', [table])
    await db.raw('DROP FUNCTION IF EXISTS ap01_fail_write()')
  })
  const definition = deferred
    ? 'CREATE CONSTRAINT TRIGGER ap01_fail_write AFTER INSERT ON ?? DEFERRABLE INITIALLY DEFERRED'
    : 'CREATE TRIGGER ap01_fail_write BEFORE INSERT OR UPDATE ON ??'
  await db.raw(`${definition} FOR EACH ROW EXECUTE FUNCTION ap01_fail_write()`, [table])
}

for (const phase of ['after-insert', 'after-assignment', 'search_documents', 'mentions', 'notifications', 'channel_members', 'preview', 'signing', 'commit']) {
  test(`failure at ${phase} rolls back the message, files and all database side effects`, async (t) => {
    const harness = await makeApp(t)
    await upload('valid')
    const initial = await snapshot()
    if (phase === 'after-insert') {
      const original = harness.service._create.bind(harness.service)
      harness.service._create = async (...args) => { await original(...args); throw new Error('synthetic after insert') }
    } else if (phase === 'after-assignment') {
      const original = harness.service.repository.claimUploads.bind(harness.service.repository)
      harness.service.repository.claimUploads = async (...args) => { await original(...args); throw new Error('synthetic after assignment') }
    } else if (phase === 'preview') {
      harness.service.attachMessagePreviews = async () => { throw new Error('synthetic preview failure') }
    } else if (phase === 'signing') {
      harness.signing.error = new Error('synthetic signing failure')
    } else {
      await installFailureTrigger(t, phase === 'commit' ? 'messages' : phase, phase === 'commit')
    }
    await assert.rejects(harness.service.create({ channel_id: 'target', content: '@Bob', file_ids: ['valid'] }, harness.params))
    assert.deepEqual(await snapshot(), initial)
    assert.deepEqual(harness.events, [])
    assert.deepEqual(harness.enqueued, [])
  })
}

function barrier() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('events and dispatcher enqueue wait for commit, with data visible on an independent connection', async (t) => {
  const { app, service, params, events, enqueued } = await makeApp(t)
  await upload('valid')
  const entered = barrier()
  const release = barrier()
  t.after(() => release.resolve())
  const visibleRows = []
  service.on('created', (message) => visibleRows.push(db('messages').where('id', message.id).first()))
  app.set('notificationSideEffectsDispatcher', { enqueue(rows) {
    enqueued.push(...rows)
    visibleRows.push(db('notifications').where('id', rows[0].id).first())
  } })
  service.hooks({ after: { create: [async () => { entered.resolve(); await release.promise }] } })
  const created = service.create({ channel_id: 'target', content: '@Bob', file_ids: ['valid'] }, params)
  await entered.promise
  assert.deepEqual(events, [])
  assert.deepEqual(enqueued, [])
  assert.equal((await db('files').where('id', 'valid').first()).message_id, null)
  release.resolve()
  const result = await created
  assert.equal(events.length, 1)
  assert.equal(enqueued.length, 1)
  assert.equal((await Promise.all(visibleRows)).every(Boolean), true)
  assert.equal((await db('files').where('id', 'valid').first()).message_id, result.id)
})

test('a failing dispatcher cannot turn a committed create into a rejection', async (t) => {
  const { app, service, params, events } = await makeApp(t)
  await upload('valid')
  app.set('notificationSideEffectsDispatcher', { enqueue() { throw new Error('synthetic enqueue failure') } })
  const result = await service.create({ channel_id: 'target', content: '@Bob', file_ids: ['valid'] }, params)
  assert.equal(events.length, 1)
  assert.equal((await db('notifications').where('message_id', result.id)).length, 1)
  assert.equal((await db('files').where('id', 'valid').first()).message_id, result.id)
})

async function waitForFileLock() {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const { rows } = await db.raw(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'update "files"%'`)
    if (rows.length) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('The competing UPDATE did not wait for a PostgreSQL lock')
}

for (const mode of ['one-file', 'overlap-reversed', 'first-rolls-back']) {
  test(`concurrent creates: ${mode} leave one consistent winning message`, async (t) => {
    const { service, params, events, enqueued } = await makeApp(t)
    await upload('one')
    await upload('two')
    await db('channels').insert({ id: 'other-target', name: 'Other', type: 'public' })
    await db('channel_members').insert({ id: 'other-alice', channel_id: 'other-target', user_id: 'alice' })
    const entered = barrier()
    const release = barrier()
    t.after(() => release.resolve())
    const claim = service.repository.claimUploads.bind(service.repository)
    let calls = 0
    service.repository.claimUploads = async (...args) => {
      const first = ++calls === 1
      const files = await claim(...args)
      if (first) {
        entered.resolve()
        await release.promise
        if (mode === 'first-rolls-back') throw new Error('synthetic rollback of first claimant')
      }
      return files
    }
    const firstIds = mode === 'overlap-reversed' ? ['one', 'two'] : ['one']
    const secondIds = mode === 'overlap-reversed' ? ['two', 'one'] : ['one']
    const first = service.create({ channel_id: 'target', content: '@Bob', file_ids: firstIds }, { ...params })
    await entered.promise
    const second = service.create({ channel_id: 'other-target', content: 'Second', file_ids: secondIds }, { ...params })
    const settled = Promise.allSettled([first, second])
    try { await waitForFileLock() } finally { release.resolve() }
    const results = await settled
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const winner = results.find((result) => result.status === 'fulfilled').value
    assert.equal((await db('messages').whereNot('id', 'source')).length, 1)
    assert.equal((await db('files').where('id', 'one').first()).message_id, winner.id)
    if (mode === 'overlap-reversed') assert.equal((await db('files').where('id', 'two').first()).message_id, winner.id)
    if (mode !== 'first-rolls-back') attachmentsUnavailable(results[1].reason)
    assert.equal(events.length, 1)
    assert.equal(enqueued.every((row) => row.message_id === winner.id), true)
  })
}

async function allowForward() {
  await db('channel_members').insert({ id: 'private-alice', channel_id: 'private', user_id: 'alice' })
}

test('concurrent creates fill the pool without requesting a second connection inside their transactions', async (t) => {
  const { service, events } = await makeApp(t)
  const user = await db('users').where('id', 'alice').first()
  const ready = barrier()
  let entered = 0
  service.hooks({ before: { create: [async () => {
    if (++entered === 8) ready.resolve()
    await ready.promise
  }] } })
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => service.create({
    channel_id: 'target', content: `Concurrent message ${index}`
  }, { provider: 'rest', authenticated: true, user })))
  assert.equal(results.length, 8)
  assert.equal(events.length, 8)
  assert.equal((await db('messages').where('channel_id', 'target')).length, 8)
})

test('forwarding uses the real create transaction and preserves copies and voice metadata', async (t) => {
  const { service, params, objects, events } = await makeApp(t)
  await allowForward()
  await upload('source-voice', 'bob', 'source')
  await upload('source-document', 'bob', 'source')
  await db('files').where('id', 'source-voice').update({ purpose: 'voice_message', duration_ms: 4200 })
  const originals = await db('files').orderBy('id')
  const result = await service.forward({ source_message_id: 'source', target_channel_id: 'target', comment: 'FYI' }, params)
  assert.equal(result.files.length, 2)
  assert.equal(objects.copied.length, 2)
  assert.equal(objects.deleted.length, 0)
  assert.equal(events.length, 1)
  assert.deepEqual(await db('files').whereIn('id', originals.map((row) => row.id)).orderBy('id'), originals)
  for (const file of result.files) {
    assert.equal(file.message_id, result.id)
    assert.equal(file.user_id, 'alice')
    assert.equal(file.storage_key, undefined)
    assert.ok(new URL(file.url).searchParams.has('X-Amz-Signature'))
  }
  assert.equal(result.files.find((file) => file.purpose === 'voice_message').duration_ms, 4200)
  assert.equal(result.forward_preview.can_access_source, true)
  assert.equal(result.forward_source_message_id, 'source')
})

test('forwarding without files and replies preserve previews and source-access restrictions', async (t) => {
  const { service, params } = await makeApp(t)
  await allowForward()
  const forwarded = await service.forward({ source_message_id: 'source', target_channel_id: 'target' }, params)
  assert.equal(forwarded.type, 'text')
  const reply = await service.create({ channel_id: 'target', content: 'Reply', reply_to_message_id: forwarded.id }, params)
  assert.equal(reply.reply_preview.id, forwarded.id)
  await assert.rejects(service.create({ channel_id: 'target', content: 'Reply', reply_to_message_id: 'source' }, params),
    (error) => error.data?.error_code === 'api.messages.reply_must_stay_in_channel')
  await db('channel_members').where('id', 'private-alice').delete()
  const read = await service.get(forwarded.id, params)
  assert.equal(read.forward_preview.can_access_source, false)
  assert.equal(read.forward_preview.source_url, null)
  await assert.rejects(service.forward({ source_message_id: 'source', target_channel_id: 'target' }, params),
    (error) => error.data?.error_code === 'api.channels.membership_required')
})

for (const failure of ['create', 'commit', 'second-copy', 'file-insert', 'target-access']) {
  test(`forwarding compensates only its own unbound copies after ${failure} failure`, async (t) => {
    const { service, params, objects, events, enqueued } = await makeApp(t)
    await allowForward()
    await upload('source-one', 'bob', 'source')
    await upload('source-two', 'bob', 'source')
    const initial = await snapshot()
    if (failure === 'commit') await installFailureTrigger(t, 'messages', true)
    if (failure === 'file-insert') await installFailureTrigger(t, 'files')
    if (failure === 'second-copy') objects.copyErrorAt = 2
    if (failure === 'create') service.attachMessagePreviews = async () => { throw new Error('synthetic forward preview failure') }
    if (failure === 'target-access') {
      await db('channels').insert({ id: 'denied-target', name: 'Denied', type: 'private' })
    }
    await assert.rejects(service.forward({ source_message_id: 'source', target_channel_id: failure === 'target-access' ? 'denied-target' : 'target' }, params))
    assert.equal(objects.copied.length > 0, true)
    assert.deepEqual(objects.deleted.map((entry) => entry.Key).sort(), objects.copied.map((entry) => entry.Key).sort())
    assert.deepEqual(await snapshot(), initial)
    assert.deepEqual(events, [])
    assert.deepEqual(enqueued, [])
  })
}

test('forward compensation preserves a copy that committed before a subsequent event listener failed', async (t) => {
  const { service, params, objects } = await makeApp(t)
  await allowForward()
  await upload('source-file', 'bob', 'source')
  service.on('created', () => { throw new Error('synthetic failing application listener') })
  await assert.rejects(service.forward({ source_message_id: 'source', target_channel_id: 'target' }, params))
  const copy = await db('files').where('user_id', 'alice').first()
  assert.ok(copy.message_id)
  assert.ok(await db('messages').where('id', copy.message_id).first())
  assert.equal(objects.deleted.length, 0)
})

test('forward cleanup keeps the original error when database cleanup is unavailable', async (t) => {
  const { service, params, objects } = await makeApp(t)
  await allowForward()
  await upload('source-file', 'bob', 'source')
  service.attachMessagePreviews = async () => { throw new Error('original create failure') }
  service.repository.deleteUnboundForwardFile = async () => { throw new Error('synthetic DB unavailable') }
  await assert.rejects(service.forward({ source_message_id: 'source', target_channel_id: 'target' }, params), /original create failure/)
  assert.equal(objects.deleted.length, 0)
  assert.equal((await db('files').where('user_id', 'alice').first()).message_id, null)
})

test('outer transactions are rejected before any create writes', async (t) => {
  const { service, params, events } = await makeApp(t)
  const initial = await snapshot()
  await db.transaction(async (trx) => {
    await assert.rejects(service.create({ channel_id: 'target', content: 'Text' }, { ...params, transaction: { trx } }), /outer transaction/)
  })
  assert.deepEqual(await snapshot(), initial)
  assert.deepEqual(events, [])
})

test('push failures after commit preserve the successful response and persisted notification', async (t) => {
  const { app, service, params } = await makeApp(t, { transports: true })
  let pushes = 0
  const dispatcher = createNotificationSideEffectsDispatcher(app, {
    hasVisibleSession: () => false,
    sendPush: async () => { pushes++; throw new Error('synthetic push failure') },
    log: { error() {} }
  })
  app.set('notificationSideEffectsDispatcher', dispatcher)
  const result = await service.create({ channel_id: 'target', content: '@Bob' }, params)
  // The dispatcher starts in a microtask; wait until its push attempt has run.
  await waitUntil(() => pushes === 1)
  assert.equal((await db('notifications').where('message_id', result.id)).length, 1)
  assert.ok(await db('messages').where('id', result.id).first())
})

async function waitUntil(predicate) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for a test condition')
}

function rpc(socket, method, path, ...args) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(method, path, ...args, (timeout, error, result) => {
      if (timeout || error) reject(timeout || error)
      else resolve(result)
    })
  })
}

async function connectSocket(t, harness, userId) {
  const socket = io(harness.url, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false })
  t.after(() => socket.disconnect())
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
    socket.connect()
  })
  if (userId) {
    const params = await harness.paramsFor(userId)
    await rpc(socket, 'create', 'authentication', params.authentication, {})
    await waitUntil(() => harness.app.channel(`user/${userId}`).connections.length > 0)
    const memberships = await db('channel_members').where('user_id', userId)
    for (const membership of memberships) {
      await waitUntil(() => harness.app.channel(`channel/${membership.channel_id}`).connections.some((connection) => connection.user.id === userId))
    }
  }
  return socket
}

test('HTTP/JWT create enforces file and channel boundaries and returns only authorized metadata', async (t) => {
  const harness = await makeApp(t, { transports: true })
  await upload('own-file')
  await upload('foreign-file', 'bob', 'source')
  const post = (data, token = harness.params.authentication.accessToken) => fetch(`${harness.url}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data)
  })
  const data = { channel_id: 'target', content: 'Attempt', file_ids: ['foreign-file'] }
  assert.equal((await post(data, null)).status, 401)
  assert.equal((await post(data, 'invalid')).status, 401)
  assert.equal((await post({ ...data, channel_id: 'private' })).status, 403)
  const denied = await post(data)
  assert.equal(denied.status, 400)
  const body = await denied.json()
  attachmentsUnavailable(body)
  assert.equal(JSON.stringify(body).includes('foreign-file'), false)
  assert.equal(harness.events.length, 0)
  const response = await post({ ...data, file_ids: ['own-file'] })
  assert.equal(response.status, 201)
  const created = await response.json()
  assert.equal(created.files[0].id, 'own-file')
  assert.equal(created.files[0].storage_key, undefined)
  assert.equal(created.files[0].bucket, undefined)
  assert.ok(new URL(created.files[0].url).searchParams.has('X-Amz-Signature'))
})

test('Socket.IO create and internal broadcasts use the same file boundary and committed safe payloads', async (t) => {
  const harness = await makeApp(t, { transports: true })
  await db('users').insert({ id: 'outsider', email: 'outsider@test.invalid', password: 'unused', display_name: 'Outside', webauthn_user_id: 'outside-key' })
  const alice = await connectSocket(t, harness, 'alice')
  const outsider = await connectSocket(t, harness, 'outsider')
  const anonymous = await connectSocket(t, harness)
  const received = []
  const outsideEvents = []
  alice.on('messages created', (message) => received.push(message))
  outsider.on('messages created', (message) => outsideEvents.push(message))
  await upload('foreign-file', 'bob', 'source')
  await upload('socket-file')
  await upload('internal-file')
  const data = { channel_id: 'target', content: 'Attempt', file_ids: ['foreign-file'] }
  await assert.rejects(rpc(anonymous, 'create', 'messages', data, {}), (error) => error.code === 401)
  await assert.rejects(rpc(alice, 'create', 'messages', { ...data, channel_id: 'private' }, {}), (error) => error.code === 403)
  await assert.rejects(rpc(alice, 'create', 'messages', data, {}), attachmentsUnavailable)
  assert.equal(received.length, 0)
  const result = await rpc(alice, 'create', 'messages', { ...data, file_ids: ['socket-file'] }, {})
  assert.equal(result.files[0].storage_key, undefined)
  const internal = await harness.service.create({ channel_id: 'target', content: 'Internal', file_ids: ['internal-file'] }, {
    user: await db('users').where('id', 'alice').first()
  })
  assert.ok(internal.files[0].storage_key)
  await waitUntil(() => received.length === 2)
  await rpc(outsider, 'get', 'users', 'outsider', {})
  assert.deepEqual(outsideEvents, [])
  for (const message of received) {
    assert.equal(message.files[0].storage_key, undefined)
    assert.equal(message.files[0].bucket, undefined)
    assert.ok(await db('messages').where('id', message.id).first())
    assert.ok(new URL(message.files[0].url).searchParams.has('X-Amz-Signature'))
  }
  alice.disconnect()
  outsider.disconnect()
  anonymous.disconnect()
})
