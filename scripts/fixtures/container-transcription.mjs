// Copied into /app/backend and executed inside the actual worker image only.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import knex from 'knex'
import { encryptSecret } from './src/lib/ai-secrets.js'
import { createStorageClient, uploadFile } from './src/lib/storage.js'
import { queueTranscriptRecordingJobs } from './src/services/meetings/transcription-jobs.js'

const db = knex({ client: 'pg', connection: {
  host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD
} })
try {
  if (process.argv[2] === 'seed') {
    const directory = await mkdtemp(join(tmpdir(), 'container-transcription-'))
    const storage = createStorageClient()
    try {
      const audio = join(directory, 'speech.mp4')
      await promisify(execFile)('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', audio])
      await uploadFile(storage, { buffer: await readFile(audio), key: 'container-fixture.mp4', mime: 'audio/mp4', bucket: process.env.STORAGE_S3_BUCKET })
      const owner = await db('users').where('email', 'containers@example.com').first()
      const now = new Date().toISOString()
      await db.transaction(async (trx) => {
        await trx('channels').insert({ id: 'container-meeting-chat', name: 'Container meeting', type: 'private', purpose: 'meeting', is_voice: true })
        await trx('ai_provider_instances').insert({ id: 'container-provider', provider_type: 'openai_compatible',
          display_name: 'Isolated container provider', base_url: process.env.MOCK_PROVIDER_ORIGIN, enabled: true })
        await trx('ai_provider_secrets').insert({ provider_instance_id: 'container-provider',
          encrypted_secret: encryptSecret({ get: () => ({ secret: process.env.JWT_SECRET }) }, 'isolated-provider-key') })
        await trx('ai_function_configs').where('function_key', 'transcription').update({
          enabled: true, provider_instance_id: 'container-provider', model: 'whisper-1'
        })
        await trx('meetings').insert({ id: 'container-meeting', status: 'ended', language: 'en', chat_channel_id: 'container-meeting-chat',
          host_user_id: owner.id, started_at: now, ended_at: now })
        await trx('meeting_recordings').insert({ id: 'container-recording', meeting_id: 'container-meeting',
          participant_identity: owner.id, participant_display_name: 'Container admin', status: 'ready',
          storage_bucket: process.env.STORAGE_S3_BUCKET, storage_key: 'container-fixture.mp4', mime_type: 'audio/mp4', started_at: now, duration_ms: 2000 })
        await trx('meeting_artifacts').insert({ id: 'container-transcript', meeting_id: 'container-meeting',
          artifact_type: 'transcript', status: 'processing', transcription_generation: 'container-generation' })
        await queueTranscriptRecordingJobs(trx, { artifactId: 'container-transcript', meetingId: 'container-meeting', generation: 'container-generation' })
      })
    } finally { storage.destroy(); await rm(directory, { recursive: true, force: true }) }
  } else if (process.argv[2] === 'verify') {
    const artifact = await db('meeting_artifacts').where('id', 'container-transcript').first()
    const job = await db('meeting_transcription_jobs').where('artifact_id', artifact.id).first()
    assert.equal(job.status, 'completed', JSON.stringify(job))
    assert.equal(artifact.status, 'ready')
    assert.match(artifact.payload.text, /Container transcript succeeded/)
    assert.equal(Number((await db('meeting_transcription_chunks').where('job_id', job.id).count('id as count').first()).count), 1)
    console.log('Real worker downloaded S3 audio, ran FFmpeg, sent Opus to the isolated provider and persisted a completed transcript')
  } else throw new Error('Expected seed or verify')
} finally { await db.destroy() }
