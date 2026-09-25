import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'
import { up as upgradeTranscriptionWorker } from '../migrations/074_transcription_worker.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { planBoundedSpeechChunks } from '../src/lib/streamed-meeting-audio.js'
import { MeetingArtifactsDomainService } from '../src/domains/meetings/artifacts.js'
import {
  claimNextTranscriptionJob,
  finishTranscriptionJob,
  queueTranscriptRecordingJobs,
  recoverExpiredTranscriptionJobs,
  saveTranscriptionChunk
} from '../src/services/meetings/transcription-jobs.js'
import {
  finalizeEligibleTranscripts,
  processClaimedTranscriptionJob
} from '../src/services/meetings/transcription-worker-runtime.js'
import { deliverPendingTranscriptEvents } from '../src/services/meetings/transcription-api-runtime.js'

let fixture, db
before(async () => { fixture = await createPostgresTestDb(); db = fixture.db })
after(async () => fixture?.close())
beforeEach(async () => {
  await db('meetings').del()
  await db('channels').del()
  await db('users').del()
  await db('ai_function_configs').where('function_key', 'transcription').update({
    enabled: false, provider_instance_id: null, model: null
  })
  await db('ai_provider_instances').del()
  await db('users').insert({
    id: 'host', email: 'host@transcription.invalid', display_name: 'Host', password: 'unused', webauthn_user_id: 'host'
  })
  await db('channels').insert({ id: 'chat', name: 'Meeting', type: 'private' })
  await db('meetings').insert({
    id: 'meeting', status: 'ended', language: 'de', chat_channel_id: 'chat', host_user_id: 'host',
    started_at: '2026-09-24T08:00:00.000Z', ended_at: '2026-09-24T09:30:00.000Z'
  })
  await db('meeting_artifacts').insert({
    id: 'transcript', meeting_id: 'meeting', artifact_type: 'transcript',
    status: 'processing', transcription_generation: 'generation-1'
  })
})

async function addRecording(id, startedAt = '2026-09-24T08:00:00.000Z') {
  await db('meeting_recordings').insert({
    id, meeting_id: 'meeting', participant_identity: id, participant_display_name: id,
    status: 'ready', storage_bucket: 'recordings', storage_key: `${id}.mp4`,
    mime_type: 'video/mp4', started_at: startedAt, duration_ms: 5_400_000
  })
}

async function queueJobs() {
  await db.transaction((trx) => queueTranscriptRecordingJobs(trx, {
    artifactId: 'transcript', meetingId: 'meeting', generation: 'generation-1'
  }))
}

function chunk(index, text) {
  return {
    chunk_index: index,
    start_ms: index * 298_000,
    end_ms: index * 298_000 + 300_000,
    language: 'de',
    segments: [{ speaker_user_id: null, speaker_label: 'speaker-1', start_ms: index * 298_000, end_ms: index * 298_000 + 1000, text }],
    filter_summary: { raw_segment_count: 1, kept_segment_count: 1, dropped_no_speech_count: 0,
      dropped_compression_count: 0, dropped_boilerplate_count: 0 }
  }
}

test('concurrent claims select a recording once and a crashed worker resumes after a bounded delay', async () => {
  await addRecording('speaker-1')
  await queueJobs()
  const [first, second] = await Promise.all([
    claimNextTranscriptionJob(db), claimNextTranscriptionJob(db)
  ])
  const job = first || second
  assert.ok(job)
  assert.equal([first, second].filter(Boolean).length, 1)
  assert.equal(job.attempt_count, 1)
  assert.equal(await saveTranscriptionChunk(db, job, chunk(0, 'Hallo')), true)

  const crashTime = new Date(Date.now() + 121_000)
  await recoverExpiredTranscriptionJobs(db, crashTime)
  const waiting = await db('meeting_transcription_jobs').where('id', job.id).first()
  assert.equal(waiting.status, 'retry_wait')
  assert.equal(timestamp(waiting.next_run_at) - crashTime.getTime(), 300_000)
  assert.equal(await db('meeting_transcription_chunks').where('job_id', job.id).count('id as total').first().then((row) => Number(row.total)), 1)

  const resumed = await claimNextTranscriptionJob(db, new Date(timestamp(waiting.next_run_at) + 1))
  assert.equal(resumed.id, job.id)
  assert.equal(resumed.attempt_count, 2)
  assert.equal(await saveTranscriptionChunk(db, job, chunk(1, 'stale')), false)
  await finishTranscriptionJob(db, resumed, { failureCode: 'provider_unavailable', failureMessage: '503', retryable: true })
  const secondWait = await db('meeting_transcription_jobs').where('id', job.id).first()
  assert.equal(timestamp(secondWait.next_run_at) - timestamp(secondWait.updated_at), 1_800_000)
  const third = await claimNextTranscriptionJob(db, new Date(timestamp(secondWait.next_run_at) + 1))
  assert.equal(third.attempt_count, 3)
  await finishTranscriptionJob(db, third, { failureCode: 'provider_unavailable', failureMessage: '503', retryable: true })
  assert.equal((await db('meeting_transcription_jobs').where('id', job.id).first()).status, 'failed')
  assert.equal((await db('meeting_recordings').where('id', 'speaker-1').first()).status, 'failed')
})

test('completed chunks survive a worker restart and only unfinished audio reaches the provider', async () => {
  await addRecording('speaker-1')
  await queueJobs()
  const app = { get(name) { return name === 'authentication' ? { secret: 'test-transcription-secret' } : undefined } }
  await db('ai_provider_instances').insert({
    id: 'provider', provider_type: 'openai', display_name: 'Provider', enabled: true
  })
  await db('ai_provider_secrets').insert({
    provider_instance_id: 'provider', encrypted_secret: encryptSecret(app, 'provider-key')
  })
  await db('ai_function_configs').where('function_key', 'transcription').update({
    enabled: true, provider_instance_id: 'provider', model: 'whisper-1'
  })
  const job = await claimNextTranscriptionJob(db)
  const sourceSignature = createHash('sha256')
    .update(JSON.stringify({ source: 'source-1', plan: planBoundedSpeechChunks(598), encoder: 'ogg-opus-64k-v1' }))
    .digest('hex')
  const providerSignature = createHash('sha256')
    .update(JSON.stringify(['provider', 'openai', '', 'whisper-1']))
    .digest('hex')
  await db('meeting_transcription_jobs').where('id', job.id).update({
    source_signature: sourceSignature, runtime_signature: providerSignature
  })
  await saveTranscriptionChunk(db, job, chunk(0, 'Schon fertig'))
  const sent = []
  const media = {
    async download() {
      return { directory: await mkdtemp(join(tmpdir(), 'transcription-resume-')), path: 'unused', signature: 'source-1' }
    },
    async probe() { return 598 },
    async detect() { return [] },
    async *iterate() {
      yield { index: 0, buffer: Buffer.from('old'), mime: 'audio/ogg', offsetMs: 0, durationMs: 300_000 }
      yield { index: 1, buffer: Buffer.from('new'), mime: 'audio/ogg', offsetMs: 298_000, durationMs: 300_000 }
    }
  }
  await processClaimedTranscriptionJob({
    db, app, storageClient: {}, job, media,
    async transcribe({ file }) {
      sent.push(file.buffer.toString())
      return { language: 'de', text: 'Noch ein Satz', segments: [{ start: 0, end: 1, text: 'Noch ein Satz' }] }
    }
  })
  assert.deepEqual(sent, ['new'])
  assert.equal((await db('meeting_transcription_jobs').where('id', job.id).first()).status, 'completed')
  await finalizeEligibleTranscripts(db)
  const artifact = await db('meeting_artifacts').where('id', 'transcript').first()
  assert.equal(artifact.status, 'ready')
  assert.equal(artifact.payload.segments.length, 2)
})

test('partial transcript finalization persists one event and manual regeneration starts fresh', async () => {
  await addRecording('speaker-1')
  await addRecording('speaker-2', '2026-09-24T08:01:00.000Z')
  await queueJobs()
  const first = await claimNextTranscriptionJob(db)
  await saveTranscriptionChunk(db, first, chunk(0, 'Guten Morgen'))
  await finishTranscriptionJob(db, first)
  const second = await claimNextTranscriptionJob(db)
  await finishTranscriptionJob(db, second, { failureCode: 'provider_rejected', failureMessage: '400', retryable: false })
  assert.equal(await finalizeEligibleTranscripts(db), 1)
  assert.equal(await finalizeEligibleTranscripts(db), 0)
  const artifact = await db('meeting_artifacts').where('id', 'transcript').first()
  assert.equal(artifact.status, 'ready')
  assert.equal(artifact.payload.completeness, 'partial')
  assert.equal(artifact.payload.warnings[0].recording_id, 'speaker-2')
  const events = []
  const app = {
    get() { return db },
    service() { return { emit(name, payload) { events.push({ name, payload }) } } }
  }
  assert.equal(await deliverPendingTranscriptEvents(app, { indexArtifact: async () => {} }), 1)
  assert.equal(await deliverPendingTranscriptEvents(app, { indexArtifact: async () => {} }), 0)
  assert.equal(events[0].name, 'artifacts-updated')
  assert.deepEqual(events[0].payload.artifactTypes, ['transcript'])

  const domain = new MeetingArtifactsDomainService({ db, app, createIdFn: () => 'generation-2' })
  await db.transaction((trx) => domain.queueProcessingArtifact(trx, {
    meetingId: 'meeting', artifactType: 'transcript', nowIso: new Date().toISOString()
  }))
  assert.equal((await db('meeting_artifacts').where('id', 'transcript').first()).transcription_generation, 'generation-2')
  assert.equal((await db('meeting_transcription_jobs').where('artifact_id', 'transcript')).length, 2)
  assert.equal((await db('meeting_transcription_chunks')).length, 0)
  assert.ok((await db('meeting_transcription_jobs').where('artifact_id', 'transcript')).every((job) => job.attempt_count === 0))
})

test('completed sections remain available when a later section permanently fails', async () => {
  await addRecording('speaker-1')
  await queueJobs()
  const job = await claimNextTranscriptionJob(db)
  await saveTranscriptionChunk(db, job, chunk(0, 'Erster Abschnitt'))
  await finishTranscriptionJob(db, job, {
    failureCode: 'provider_rejected', failureMessage: '400', retryable: false
  })
  assert.equal(await finalizeEligibleTranscripts(db), 1)
  const artifact = await db('meeting_artifacts').where('id', 'transcript').first()
  assert.equal(artifact.status, 'ready')
  assert.equal(artifact.payload.completeness, 'partial')
  assert.match(artifact.payload.text, /Erster Abschnitt/)
  assert.equal(artifact.payload.warnings[0].recording_id, 'speaker-1')
})

test('a missing S3 recording fails immediately with a clear status', async () => {
  await addRecording('speaker-1')
  await queueJobs()
  const app = { get(name) { return name === 'authentication' ? { secret: 'test-transcription-secret' } : undefined } }
  await db('ai_provider_instances').insert({
    id: 'provider', provider_type: 'openai', display_name: 'Provider', enabled: true
  })
  await db('ai_provider_secrets').insert({
    provider_instance_id: 'provider', encrypted_secret: encryptSecret(app, 'provider-key')
  })
  await db('ai_function_configs').where('function_key', 'transcription').update({
    enabled: true, provider_instance_id: 'provider', model: 'whisper-1'
  })
  const job = await claimNextTranscriptionJob(db)
  await processClaimedTranscriptionJob({
    db, app, storageClient: {}, job,
    media: { async download() { throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }) } }
  })
  const failedJob = await db('meeting_transcription_jobs').where('id', job.id).first()
  assert.equal(failedJob.status, 'failed')
  assert.equal(failedJob.attempt_count, 1)
  assert.equal(failedJob.failure_code, 'recording_missing')
  assert.equal((await db('meeting_recordings').where('id', 'speaker-1').first()).failure_code, 'recording_missing')
  await finalizeEligibleTranscripts(db)
  const artifact = await db('meeting_artifacts').where('id', 'transcript').first()
  assert.equal(artifact.status, 'failed')
  assert.equal(artifact.payload.warnings[0].code, 'recording_missing')
})

function timestamp(value) {
  return new Date(value).getTime()
}

test('migration backfills only existing pending transcript artifacts', async () => {
  const legacy = await createPostgresTestDb({ migrationTarget: '073_meeting_recording_retention.js' })
  try {
    const oldDb = legacy.db
    await oldDb('users').insert({
      id: 'legacy-host', email: 'legacy@transcription.invalid', display_name: 'Legacy',
      password: 'unused', webauthn_user_id: 'legacy-host'
    })
    await oldDb('channels').insert({ id: 'legacy-chat', name: 'Legacy', type: 'private' })
    await oldDb('meetings').insert({
      id: 'legacy-meeting', status: 'ended', language: 'de', chat_channel_id: 'legacy-chat',
      host_user_id: 'legacy-host', started_at: '2026-09-24T08:00:00.000Z', ended_at: '2026-09-24T09:00:00.000Z'
    })
    await oldDb('meeting_recordings').insert({
      id: 'legacy-recording', meeting_id: 'legacy-meeting', participant_identity: 'legacy-host',
      status: 'ready', storage_bucket: 'recordings', storage_key: 'legacy.mp4'
    })
    await oldDb('meeting_artifacts').insert({
      id: 'legacy-pending', meeting_id: 'legacy-meeting', artifact_type: 'transcript', status: 'pending'
    })
    await upgradeTranscriptionWorker(oldDb)
    const artifact = await oldDb('meeting_artifacts').where('id', 'legacy-pending').first()
    assert.ok(artifact.transcription_generation)
    assert.equal(artifact.status, 'processing')
    const jobs = await oldDb('meeting_transcription_jobs').where('artifact_id', artifact.id)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].recording_id, 'legacy-recording')
    assert.equal(jobs[0].attempt_count, 0)
  } finally {
    await legacy.close()
  }
})
