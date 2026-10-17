import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryDb } from './helpers/memory-db.js'
import { updateSummaryArtifact } from '../src/services/meetings/summary-processor.js'

const meeting = { id: 'meeting', title: 'Weekly Sync', chat_channel_id: 'chat' }
const artifact = { id: 'summary', meeting_id: meeting.id, artifact_type: 'summary', status: 'processing', summary_version: 0 }
const payload = { mini_summary: 'Private summary content', markdown: 'Private summary content' }

function fixture({ summary = {}, participants, dispatch } = {}) {
  const db = createMemoryDb({
    meeting_artifacts: [{ ...artifact, ...summary }],
    meeting_participants: participants || [
      { meeting_id: 'meeting', user_id: 'host', role: 'host', joined_at: '2026-10-01', invite_status: 'joined' },
      { meeting_id: 'meeting', user_id: 'left', joined_at: '2026-10-01', invite_status: 'left' },
      { meeting_id: 'meeting', user_id: 'invited', joined_at: null, invite_status: 'invited' },
      { meeting_id: 'another', user_id: 'other', joined_at: '2026-10-01' },
      { meeting_id: 'meeting', user_id: 'deleted', joined_at: '2026-10-01' }
    ],
    users: [
      { id: 'host', preferred_locale: 'de', status: 'dnd' },
      { id: 'left', preferred_locale: 'en' },
      { id: 'invited' }, { id: 'other' }
    ],
    channel_members: [{ channel_id: 'chat', user_id: 'host', notifications: 'none' }]
  })
  const delivered = []
  const app = {
    get(key) {
      if (key === 'postgresqlClient') return db
      if (key === 'upsertMeetingArtifactSearchDocument') return async () => {}
      if (key === 'notificationSideEffectsDispatcher') return { enqueue(rows) {
        assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
        assert.equal(db.tables.notifications.length, rows.length)
        if (dispatch) return dispatch(rows)
        delivered.push(...rows)
      } }
    },
    service() { return { emit() {} } }
  }
  return { db, app, delivered }
}

test('first ready summary notifies existing attendees, including host and departed users, despite mute/DND', async () => {
  const { db, app, delivered } = fixture()
  await updateSummaryArtifact(app, artifact, meeting, { status: 'ready', payload })
  assert.deepEqual(db.tables.notifications.map(row => row.user_id), ['host', 'left'])
  assert.equal(delivered.length, 2)
  assert.ok(db.tables.meeting_artifacts[0].summary_ready_notified_at)
  for (const row of delivered) {
    assert.equal(row.type, 'meeting_summary_ready')
    assert.equal(row.meeting_id, meeting.id)
    assert.equal(row.channel_id, 'chat')
    assert.equal(row.message_id, null)
    assert.equal(row.actor_id, null)
    assert.equal(row.actor_display_name, 'Nebulynk')
    assert.equal(row.is_read, false)
    assert.ok(row.id)
    assert.ok(!row.message_snippet.includes(payload.mini_summary))
  }
  assert.equal(delivered[0].message_snippet, 'Die Zusammenfassung für „Weekly Sync“ ist fertig.')
  assert.equal(delivered[1].message_snippet, 'The summary for “Weekly Sync” is ready.')
  await updateSummaryArtifact(app, artifact, meeting, { status: 'ready', payload })
  assert.equal(db.tables.notifications.length, 2)
})

test('failed first generation can be retried; only the successful completion creates notifications', async () => {
  const { db, app } = fixture()
  await updateSummaryArtifact(app, artifact, meeting, { status: 'failed', payload: {} })
  assert.equal(db.tables.notifications.length, 0)
  assert.equal(db.tables.meeting_artifacts[0].summary_ready_notified_at, undefined)
  Object.assign(db.tables.meeting_artifacts[0], { status: 'processing' })
  await updateSummaryArtifact(app, { ...db.tables.meeting_artifacts[0] }, meeting, { status: 'ready', payload })
  assert.equal(db.tables.notifications.length, 2)
})

test('later generation keeps the durable marker and sends no additional notification', async () => {
  const { db, app } = fixture({ summary: { summary_ready_notified_at: '2026-10-01' } })
  await updateSummaryArtifact(app, artifact, meeting, { status: 'ready', payload })
  assert.equal(db.tables.notifications.length, 0)
  assert.equal(db.tables.meeting_artifacts[0].summary_ready_notified_at, '2026-10-01')
})

for (const status of ['ready', 'failed']) test(`regeneration (${status}) never notifies, including restored previous summaries`, async () => {
  const { db, app } = fixture()
  const revision = { id: 'regeneration', before_payload: payload, publish_change: true }
  db.tables.meeting_summary_revisions.push(revision)
  await updateSummaryArtifact(app, artifact, meeting, { status, payload }, revision, 'Changed')
  assert.equal(db.tables.notifications.length, 0)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.ok(db.tables.meeting_artifacts[0].summary_ready_notified_at)
})

test('dispatch failures leave the committed summary and its notifications intact', async () => {
  const { db, app } = fixture({ dispatch() { throw new Error('Dispatcher stopped') } })
  await updateSummaryArtifact(app, artifact, meeting, { status: 'ready', payload })
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.notifications.length, 2)
})

test('completion without attendees still marks the first ready generation and uses a localized untitled fallback', async () => {
  const empty = fixture({ participants: [] })
  await updateSummaryArtifact(empty.app, artifact, meeting, { status: 'ready', payload })
  assert.ok(empty.db.tables.meeting_artifacts[0].summary_ready_notified_at)
  assert.equal(empty.db.tables.notifications.length, 0)
  const attended = fixture()
  await updateSummaryArtifact(attended.app, artifact, { ...meeting, title: ' ' }, { status: 'ready', payload })
  assert.equal(attended.delivered[0].message_snippet, 'Die Zusammenfassung für „Meeting“ ist fertig.')
})
