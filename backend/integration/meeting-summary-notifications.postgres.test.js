import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { updateSummaryArtifact } from '../src/services/meetings/summary-processor.js'
import { NotificationsService } from '../src/services/notifications/notifications.js'
import { up, down } from '../migrations/076_meeting_summary_notifications.js'

let fixture, db
const payload = { mini_summary: 'Summary', markdown: 'Summary' }
before(async () => {
  fixture = await createPostgresTestDb()
  db = fixture.db
  await db('users').insert(['host', 'left', 'invited'].map(id => ({
    id, email: `${id}@test.invalid`, password: 'unused', display_name: id, webauthn_user_id: id
  })))
})
after(async () => fixture?.close())

async function seed(database, id) {
  await database('channels').insert({ id: `${id}-chat`, name: 'Meeting chat', type: 'private', purpose: 'meeting' })
  const meeting = { id, title: 'Weekly', language: 'en', host_user_id: 'host', chat_channel_id: `${id}-chat`, status: 'ended' }
  await database('meetings').insert(meeting)
  await database('meeting_participants').insert(['host', 'left', 'invited'].map(userId => ({
    id: `${id}-${userId}`, meeting_id: id, user_id: userId,
    role: userId === 'host' ? 'host' : 'participant',
    invite_status: userId === 'invited' ? 'invited' : 'left',
    joined_at: userId === 'invited' ? null : new Date()
  })))
  const artifact = { id: `${id}-summary`, meeting_id: id, artifact_type: 'summary', status: 'processing', summary_version: 0 }
  await database('meeting_artifacts').insert(artifact)
  return { meeting, artifact }
}

function app(database, batches = []) {
  return {
    get(key) {
      if (key === 'postgresqlClient') return database
      if (key === 'upsertMeetingArtifactSearchDocument') return async () => {}
      if (key === 'notificationSideEffectsDispatcher') return { enqueue: rows => batches.push(rows) }
    },
    service: () => ({ emit() {} })
  }
}

test('real SQL: concurrent summary completions store and dispatch exactly one notification per attendee', async () => {
  const { meeting, artifact } = await seed(db, 'concurrent-summary')
  const batches = []
  await Promise.all([1, 2].map(() => updateSummaryArtifact(app(db, batches), artifact, meeting, { status: 'ready', payload })))
  const rows = await db('notifications').where('meeting_id', meeting.id).orderBy('user_id')
  assert.deepEqual(rows.map(row => row.user_id), ['host', 'left'])
  assert.equal(batches.length, 1)
  assert.equal((await db('meeting_artifacts').where('id', artifact.id).first()).summary_version, 1)
  // Marking a summary read is isolated from invitations, other meetings and users.
  await db('notifications').insert({ ...rows[0], id: 'separate-invite', type: 'meeting_invite' })
  const notifications = new NotificationsService({ Model: db, name: 'notifications' })
  assert.equal((await notifications.patch(null, { is_read: true }, {
    user: { id: 'host' }, query: { meeting_id: meeting.id, type: 'meeting_summary_ready', is_read: false }
  })).updated, 1)
  assert.equal((await db('notifications').where('id', 'separate-invite').first()).is_read, false)
  assert.equal((await db('notifications').where({ user_id: 'left', meeting_id: meeting.id }).first()).is_read, false)
})

test('real SQL: a notification insert failure rolls back summary, version and completion marker', async () => {
  const { meeting, artifact } = await seed(db, 'rollback-summary')
  const failingDb = table => db(table)
  failingDb.transaction = callback => db.transaction(async trx => callback(table => {
    const query = trx(table)
    if (table === 'notifications') query.insert = async () => { throw new Error('Injected notification failure') }
    return query
  }))
  const batches = []
  await assert.rejects(updateSummaryArtifact(app(failingDb, batches), artifact, meeting, { status: 'ready', payload }), /Injected notification failure/)
  const saved = await db('meeting_artifacts').where('id', artifact.id).first()
  assert.equal(saved.status, 'processing')
  assert.equal(saved.payload, null)
  assert.equal(saved.summary_version, 0)
  assert.equal(saved.summary_ready_notified_at, null)
  assert.equal((await db('notifications').where('meeting_id', meeting.id)).length, 0)
  assert.equal(batches.length, 0)
  await updateSummaryArtifact(app(db, batches), artifact, meeting, { status: 'ready', payload })
  assert.equal(batches[0].length, 2)
})

test('real SQL: migration suppresses historical summaries and ongoing regenerations but preserves pending first generations', async () => {
  const historical = await createPostgresTestDb({ migrationTarget: '075_meeting_summary_revisions.js' })
  try {
    const database = historical.db
    await database('users').insert(['host', 'left', 'invited'].map(id => ({ id, email: `${id}@test.invalid`, password: 'unused', display_name: id, webauthn_user_id: id })))
    const ready = await seed(database, 'historical-ready')
    const regenerating = await seed(database, 'historical-regenerating')
    const pending = await seed(database, 'pending-first')
    await database('meeting_artifacts').where('id', ready.artifact.id).update({ status: 'ready', payload })
    await database('meeting_summary_revisions').insert({
      id: 'old-regeneration', meeting_id: regenerating.meeting.id, base_version: 0,
      kind: 'regenerate', status: 'generating', before_payload: payload
    })
    await database.transaction(up)
    const summaries = await database('meeting_artifacts').orderBy('meeting_id')
    assert.ok(summaries.find(row => row.id === ready.artifact.id).summary_ready_notified_at)
    assert.ok(summaries.find(row => row.id === regenerating.artifact.id).summary_ready_notified_at)
    assert.equal(summaries.find(row => row.id === pending.artifact.id).summary_ready_notified_at, null)
    assert.equal((await database('notifications')).length, 0)
    for (const context of [regenerating, pending]) await updateSummaryArtifact(app(database), context.artifact, context.meeting, { status: 'ready', payload })
    assert.equal((await database('notifications').where('meeting_id', regenerating.meeting.id)).length, 0)
    assert.equal((await database('notifications').where('meeting_id', pending.meeting.id)).length, 2)
    await database.transaction(down)
    assert.equal(await database.schema.hasColumn('meeting_artifacts', 'summary_ready_notified_at'), false)
  } finally { await historical.close() }
})
