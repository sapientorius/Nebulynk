import test from 'node:test'
import assert from 'node:assert/strict'
import { MeetingSummaryRevisionsService, meetingSummaryRevisions } from '../src/services/meeting-summary-revisions/meeting-summary-revisions.js'
import { MeetingArtifactsDomainService } from '../src/domains/meetings/artifacts.js'
import { processPendingMeetingSummaries } from '../src/services/meetings/summary-processor.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

const host = { id: 'host', is_admin: false }
const admin = { id: 'admin', is_admin: true }
const participant = { id: 'participant', is_admin: false }
const original = { language: 'de', mini_summary: 'Falscher Begriff.', summary_points: ['Falscher Begriff.'], decisions: [], open_items: [], topic_chapters: [], coverage: { basis: ['chat'] }, markdown: 'Falscher Begriff.' }
const corrected = { language: 'en', mini_summary: 'Richtiger Begriff.', summary_points: ['Richtiger Begriff.'], decisions: [], open_items: [], topic_chapters: [], change_summary: 'Begriff korrigiert.' }

function fixture() {
  const events = [], requests = []
  const db = createMemoryDb({
    meetings: [{ id: 'meeting', host_user_id: 'host', source_channel_id: 'source', chat_channel_id: 'chat', status: 'ended', language: 'de', source_channel_type: 'private', source_channel_meeting_history_access: 'active_participants' }],
    meeting_participants: [host, participant].map(user => ({ id: user.id, meeting_id: 'meeting', user_id: user.id, joined_at: '2026-10-01T10:00:00Z' })),
    channels: [{ id: 'source', type: 'private', name: 'Team' }],
    users: [{ ...host, display_name: 'Host' }, { ...admin, display_name: 'Admin' }, { ...participant, display_name: 'Participant' }],
    meeting_artifacts: [{ id: 'summary', meeting_id: 'meeting', artifact_type: 'summary', status: 'ready', summary_version: 0, payload: original }],
    messages: [{ id: 'message', channel_id: 'chat', user_id: 'host', type: 'text', content: 'Falscher Begriff.', created_at: '2026-10-01T10:00:00Z' }],
    ai_provider_instances: [{ id: 'provider', provider_type: 'openai', enabled: true }],
    ai_function_configs: [{ function_key: 'meeting_summary', enabled: false, provider_instance_id: 'provider', model: 'test-model' }]
  })
  const values = { postgresqlClient: db, authentication: { secret: 'revision-test-key' },
    upsertMeetingArtifactSearchDocument: async () => {},
    generateStructuredObject: async request => { requests.push(request); return request.validateObject(corrected) }
  }
  const app = { get: key => values[key], service: () => ({ emit: (name, payload) => events.push({ name, payload }) }) }
  db.tables.ai_provider_secrets.push({ provider_instance_id: 'provider', encrypted_secret: encryptSecret(app, 'test-provider-key') })
  const service = new MeetingSummaryRevisionsService({ Model: db, app })
  return { service, db, app, values, events, requests }
}
const create = (f, user = host, extra = {}) => f.service.create({ meeting_id: 'meeting', instructions: 'Begriff korrigieren.', ...extra }, { user })
const apply = (f, id, user = host, publish = true) => f.service.patch(id, { action: 'apply', publish_change: publish }, { user })
const history = (f, user = participant) => f.service.find({ user, query: { meeting_id: 'meeting' } })

test('host and admin create private proposals without changing the saved summary or emitting their contents', async () => {
  for (const user of [host, admin]) {
    const f = fixture(), preview = await create(f, user)
    assert.equal(preview.payload.language, 'de')
    assert.deepEqual(f.db.tables.meeting_artifacts[0].payload, original)
    assert.equal((await history(f)).total, 0)
    assert.equal(f.events.length, 0)
    assert.deepEqual(Object.keys(preview).sort(), ['change_summary', 'id', 'meeting_id', 'payload'])
  }
})

test('participants and outsiders cannot create revisions or use another editor proposal', async () => {
  const f = fixture(), preview = await create(f)
  for (const user of [participant, { id: 'outsider' }]) await assert.rejects(create(f, user), { code: 403 })
  await assert.rejects(create(f, admin, { parent_revision_id: preview.id }), { code: 404 })
  await assert.rejects(apply(f, preview.id, admin), { code: 404 })
  await assert.rejects(history(f, { id: 'outsider' }), { code: 403 })
})

test('refinements use the current preview while comparing changes against the original saved summary', async () => {
  const f = fixture(), first = await create(f)
  const second = await create(f, host, { parent_revision_id: first.id, instructions: 'Zusätzlich präzisieren.' })
  const prompt = JSON.parse(f.requests[1].userPrompt)
  assert.equal(prompt.current_summary.mini_summary, first.payload.mini_summary)
  assert.equal(prompt.original_summary.mini_summary, original.mini_summary)
  assert.equal(prompt.editor_instructions, 'Zusätzlich präzisieren.')
  assert.deepEqual(f.db.tables.meeting_summary_revisions[1].before_payload, original)
  assert.equal(second.change_summary, corrected.change_summary)
})

test('apply publishes only the public description, refreshes search, and repeated apply is idempotent', async () => {
  const f = fixture(), preview = await create(f)
  await apply(f, preview.id)
  await apply(f, preview.id)
  const saved = f.db.tables.meeting_artifacts[0], result = await history(f)
  assert.equal(saved.summary_version, 1)
  assert.match(saved.payload.markdown, /Richtiger Begriff/)
  assert.equal(result.total, 1)
  assert.deepEqual(Object.keys(result.data[0]).sort(), ['applied_at', 'change_summary', 'id', 'user_display_name', 'user_id'])
  assert.equal(result.data[0].user_display_name, 'Host')
  assert.equal(f.events.length, 1)
  assert.deepEqual(f.events[0].payload, { meetingId: 'meeting', chatChannelId: 'chat', artifactTypes: ['summary'] })
})

test('suppressed changes remain absent from public history and counts while retaining internal snapshots', async () => {
  const f = fixture(), preview = await create(f)
  await apply(f, preview.id, host, false)
  assert.equal((await history(f)).total, 0)
  assert.equal(f.db.tables.meeting_summary_revisions[0].change_summary, null)
  assert.equal(f.db.tables.meeting_summary_revisions[0].status, 'applied')
  assert.equal(f.db.tables.meeting_artifacts[0].payload.mini_summary, corrected.mini_summary)
})

test('stale proposals cannot overwrite concurrent edits and cannot be refined', async () => {
  const f = fixture(), a = await create(f), b = await create(f, admin)
  await apply(f, b.id, admin)
  await assert.rejects(apply(f, a.id), { code: 409 })
  await assert.rejects(create(f, host, { parent_revision_id: a.id }), { code: 409 })
  assert.equal((await history(f)).total, 1)
})

test('invalid model output, provider errors, missing runtime, empty instructions and processing artifacts leave saved content intact', async () => {
  for (const generate of [async () => ({}), async () => { throw new Error('Provider offline') }]) {
    const f = fixture(); f.values.generateStructuredObject = generate
    await assert.rejects(create(f))
    assert.deepEqual(f.db.tables.meeting_artifacts[0].payload, original)
    assert.equal(f.db.tables.meeting_summary_revisions.length, 0)
  }
  const f = fixture()
  await assert.rejects(create(f, host, { instructions: '   ' }), { code: 400 })
  f.db.tables.ai_function_configs = []
  await assert.rejects(create(f), { code: 400 })
  f.db.tables.meeting_artifacts[0].status = 'processing'
  await assert.rejects(create(f), { code: 400 })
})

test('permissions and version are rechecked after generation and before apply', async () => {
  const f = fixture()
  f.values.generateStructuredObject = async request => {
    f.db.tables.meeting_artifacts[0].summary_version++
    return request.validateObject(corrected)
  }
  await assert.rejects(create(f), { code: 409 })
  const g = fixture(), preview = await create(g)
  g.db.tables.meeting_participants = []
  await assert.rejects(apply(g, preview.id), { code: 403 })
})

test('regeneration requires confirmation after corrections, invalidates drafts, and writes an optional public entry', async () => {
  for (const publishChange of [false, true]) {
    const f = fixture(), preview = await create(f)
    await apply(f, preview.id)
    const stale = await create(f)
    const artifacts = new MeetingArtifactsDomainService({ db: f.db, app: f.app })
    const args = { meeting: f.db.tables.meetings[0], user: admin, publishChange }
    await assert.rejects(artifacts.generateSummary(args), { code: 400, error_code: 'api.summary_revisions.confirm_replace' })
    await artifacts.generateSummary({ ...args, confirmReplace: true })
    assert.equal(f.db.tables.meeting_artifacts[0].status, 'processing')
    f.values.generateStructuredObject = async request => request.validateObject({ ...corrected, mini_summary: 'Neu erstellt.', change_summary: 'Zusammenfassung neu erstellt und Begriff ersetzt.' })
    assert.equal(await processPendingMeetingSummaries(f.app), 1)
    await assert.rejects(apply(f, stale.id), { code: 409 })
    assert.equal((await history(f)).total, publishChange ? 2 : 1)
    assert.equal(f.db.tables.meeting_artifacts[0].payload.mini_summary, 'Neu erstellt.')
  }
})

test('failed regeneration restores the prior summary without publishing a change', async () => {
  const f = fixture(), artifacts = new MeetingArtifactsDomainService({ db: f.db, app: f.app })
  await artifacts.generateSummary({ meeting: f.db.tables.meetings[0], user: admin })
  f.values.generateStructuredObject = async () => { throw new Error('Provider unavailable') }
  await processPendingMeetingSummaries(f.app)
  assert.equal(f.db.tables.meeting_artifacts[0].status, 'ready')
  assert.deepEqual(f.db.tables.meeting_artifacts[0].payload, original)
  assert.equal((await history(f)).total, 0)
})

test('service disables automatic public events for drafts and applied responses', () => {
  let publisher, options
  const app = { get: () => null, use: (_name, _service, args) => { options = args }, service: () => ({ publish: fn => { publisher = fn }, hooks: () => {} }) }
  meetingSummaryRevisions(app)
  assert.equal(publisher({ instructions: 'private' }), null)
  assert.deepEqual(options.methods, ['find', 'create', 'patch'])
})

test('revisions preserve more than eight highlights, original citations and absent chapter timestamps', async () => {
  const f = fixture()
  const evidence = { type: 'chat', message_id: 'message', snippet: 'Original evidence' }
  f.db.tables.meeting_artifacts[0].payload.decisions = [{ id: 'decision-1', text: 'Keep decision', evidence: [evidence] }]
  f.values.generateStructuredObject = async request => {
    const prompt = JSON.parse(request.userPrompt)
    return request.validateObject({ ...corrected, summary_points: Array.from({ length: 12 }, (_, index) => `Point ${index}`),
      decisions: prompt.current_summary.decisions,
      topic_chapters: [{ title: 'Context', summary: 'Additional context', start_ms: null, end_ms: null }] })
  }
  const proposal = await create(f)
  assert.equal(proposal.payload.summary_points.length, 12)
  assert.deepEqual(proposal.payload.decisions[0].evidence, [evidence])
  assert.equal(proposal.payload.topic_chapters[0].start_ms, null)
})
