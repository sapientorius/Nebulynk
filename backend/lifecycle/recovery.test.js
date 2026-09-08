import test from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'

async function fixture(t) {
  const fixture = await createPostgresTestDb()
  t.after(() => fixture.close())
  const { db } = fixture
  await db('users').insert({ id: 'u', email: 'recovery@example.invalid', password: 'unused', display_name: 'Recovery', webauthn_user_id: 'u', is_admin: true })
  await db('channels').insert({ id: 'c', name: 'Recovery', type: 'private' })
  await db('channel_members').insert({ id: 'cm', channel_id: 'c', user_id: 'u' })
  await db('messages').insert({ id: 'm', channel_id: 'c', user_id: 'u', content: 'Recovery input', type: 'text' })
  return db
}
function worker(t, db, args = []) {
  const child = fork(new URL('./recovery-worker.mjs', import.meta.url), args, {
    env: { ...process.env, AP05_WORKER_DB_URL: db.client.config.connection.connectionString }, silent: true
  })
  const phases = new Map()
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('message', ({ phase }) => {
    if (!phases.has(phase)) phases.set(phase, Promise.withResolvers())
    phases.get(phase).resolve()
  })
  const exit = once(child, 'exit')
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') })
  return { child, exit, output: () => output, phase(name) {
    if (!phases.has(name)) phases.set(name, Promise.withResolvers())
    return phases.get(name).promise
  } }
}

test('forced deadline rolls back a blocked reminder transaction and a fresh process delivers once', async (t) => {
  const db = await fixture(t)
  await db('message_reminders').insert({ id: 'r', user_id: 'u', message_id: 'm', channel_id: 'c', remind_at: new Date(Date.now() - 1000), status: 'active' })
  await db.raw("CREATE FUNCTION ap05_block() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(5052026); RETURN NEW; END $$")
  await db.raw('CREATE TRIGGER ap05_block BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION ap05_block()')
  const blocker = await db.client.acquireConnection()
  try {
    await blocker.query('SELECT pg_advisory_lock(5052026)')
    const first = worker(t, db)
    await first.phase('ready')
    let blocked = false
    for (let i = 0; i < 100; i++) {
      const result = await db.raw("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'")
      if (result.rows.length) { blocked = true; break }
      await delay(20)
    }
    assert.ok(blocked, first.output())
    first.child.kill('SIGTERM')
    assert.deepEqual(await first.exit, [1, null])
    assert.equal((await db('message_reminders').where('id', 'r').first()).status, 'active')
    assert.equal((await db('notifications')).length, 0)
  } finally {
    await blocker.query('SELECT pg_advisory_unlock(5052026)')
    await db.client.releaseConnection(blocker)
  }
  const second = worker(t, db)
  await second.phase('done')
  second.child.kill('SIGTERM')
  assert.deepEqual(await second.exit, [0, null])
  assert.equal((await db('message_reminders').where('id', 'r').first()).status, 'delivered')
  assert.equal((await db('notifications')).length, 1)
})

test('summary processing survives deadline exit and is resumed by a fresh process', async (t) => {
  const db = await fixture(t)
  await db('meetings').insert({ id: 'meeting', title: 'Recovery', language: 'en', status: 'ended', chat_channel_id: 'c', host_user_id: 'u', started_at: new Date(Date.now() - 60000), ended_at: new Date() })
  await db('meeting_artifacts').insert({ id: 'artifact', meeting_id: 'meeting', artifact_type: 'summary', status: 'processing' })
  await db('ai_provider_instances').insert({ id: 'provider', provider_type: 'openai', display_name: 'Synthetic', enabled: true })
  await db('ai_provider_secrets').insert({ provider_instance_id: 'provider', encrypted_secret: encryptSecret({ get: () => ({ secret: 'ap05-recovery-secret' }) }, 'synthetic') })
  await db('ai_function_configs').where('function_key', 'meeting_summary').update({ enabled: true, provider_instance_id: 'provider', model: 'synthetic' })
  const first = worker(t, db, ['--summary', '--blocked'])
  await first.phase('blocked')
  first.child.kill('SIGINT')
  assert.deepEqual(await first.exit, [1, null])
  assert.equal((await db('meeting_artifacts').where('id', 'artifact').first()).status, 'processing')
  const second = worker(t, db, ['--summary'])
  await second.phase('done')
  second.child.kill('SIGTERM')
  assert.deepEqual(await second.exit, [0, null])
  const artifact = await db('meeting_artifacts').where('id', 'artifact').first()
  assert.equal(artifact.status, 'ready')
  assert.equal(artifact.payload.mini_summary, 'Recovered summary')
})
