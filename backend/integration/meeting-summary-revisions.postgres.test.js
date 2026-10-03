import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { MeetingSummaryRevisionsService } from '../src/services/meeting-summary-revisions/meeting-summary-revisions.js'

let fixture, db, service
const original = { mini_summary: 'Original', language: 'en', summary_points: [], decisions: [], open_items: [], topic_chapters: [], markdown: 'Original' }
const host = { id: 'revision-host', is_admin: false }, admin = { id: 'revision-admin', is_admin: true }
before(async () => {
  fixture = await createPostgresTestDb(); db = fixture.db
  await db('users').insert([host, admin].map(user => ({ ...user, email: `${user.id}@test.invalid`, password: 'unused', display_name: user.id, webauthn_user_id: user.id })))
  await db('channels').insert({ id: 'revision-chat', name: 'Revision chat', type: 'private', purpose: 'meeting' })
  const app = { get: key => key === 'postgresqlClient' ? db : key === 'upsertMeetingArtifactSearchDocument' ? async () => {} : null,
    service: () => ({ emit: () => {} }) }
  service = new MeetingSummaryRevisionsService({ Model: db, app })
})
after(async () => fixture?.close())

async function seed(id) {
  await db('meetings').insert({ id, status: 'ended', host_user_id: host.id, chat_channel_id: 'revision-chat', language: 'en' })
  await db('meeting_participants').insert({ id: `${id}-host`, meeting_id: id, user_id: host.id, role: 'host', joined_at: new Date() })
  await db('meeting_artifacts').insert({ id: `${id}-summary`, meeting_id: id, artifact_type: 'summary', status: 'ready', payload: original })
  for (const [suffix, user] of [['host', host], ['admin', admin]]) await db('meeting_summary_revisions').insert({
    id: `${id}-${suffix}-draft`, meeting_id: id, user_id: user.id, base_version: 0,
    before_payload: original, payload: { ...original, mini_summary: suffix }, change_summary: `Changed by ${suffix}.`
  })
}

test('real SQL: concurrent editors commit exactly one revision and never overwrite the winner', async () => {
  await seed('concurrent-revisions')
  const results = await Promise.allSettled([host, admin].map(user => service.patch(`concurrent-revisions-${user === host ? 'host' : 'admin'}-draft`, { action: 'apply' }, { user })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 409)
  const artifact = await db('meeting_artifacts').where('id', 'concurrent-revisions-summary').first()
  assert.equal(artifact.summary_version, 1)
  const history = await service.find({ user: host, query: { meeting_id: 'concurrent-revisions' } })
  assert.equal(history.total, 1)
})

test('real SQL: a revision-write failure rolls back the summary update atomically', async () => {
  await seed('rollback-revision')
  const failingDb = table => db(table)
  failingDb.transaction = callback => db.transaction(async trx => callback(table => {
    const query = trx(table)
    if (table === 'meeting_summary_revisions') query.update = async () => { throw new Error('Injected revision write failure') }
    return query
  }))
  const failing = new MeetingSummaryRevisionsService({ Model: failingDb, app: { get: () => null } })
  await assert.rejects(failing.patch('rollback-revision-host-draft', { action: 'apply' }, { user: host }), /Injected revision write failure/)
  const artifact = await db('meeting_artifacts').where('id', 'rollback-revision-summary').first()
  assert.equal(artifact.summary_version, 0)
  assert.deepEqual(artifact.payload, original)
})

test('real SQL: history pagination excludes private and suppressed revisions and deletion cascades', async () => {
  await seed('paginated-revisions')
  for (let index = 0; index < 12; index++) await db('meeting_summary_revisions').insert({
    id: `published-${index}`, meeting_id: 'paginated-revisions', user_id: host.id, base_version: index,
    status: 'applied', before_payload: original, publish_change: index < 11,
    change_summary: 'Public change', applied_at: new Date(2026, 0, 1, 0, index)
  })
  const result = await service.find({ user: host, query: { meeting_id: 'paginated-revisions', $limit: 10, $skip: 10 } })
  assert.equal(result.total, 11)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].id, 'published-0')
  await db('meetings').where('id', 'paginated-revisions').delete()
  assert.equal((await db('meeting_summary_revisions').where('meeting_id', 'paginated-revisions')).length, 0)
})
