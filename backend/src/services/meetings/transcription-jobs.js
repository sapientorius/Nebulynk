import { createId } from '@paralleldrive/cuid2'

export const TRANSCRIPTION_MAX_ATTEMPTS = 3
export const TRANSCRIPTION_LEASE_MS = 120_000
export const TRANSCRIPTION_RETRY_DELAYS_MS = [300_000, 1_800_000]

export async function queueTranscriptRecordingJobs(trx, { artifactId, meetingId, generation }) {
  await trx('meeting_transcription_jobs').where('artifact_id', artifactId).del()
  const recordings = await trx('meeting_recordings').where('meeting_id', meetingId).select('id')
  if (recordings.length === 0) return
  await trx('meeting_transcription_jobs').insert(recordings.map((recording) => ({
    id: createId(),
    artifact_id: artifactId,
    recording_id: recording.id,
    generation,
    status: 'queued',
    attempt_count: 0
  })))
}

function nextAttemptState(job, now) {
  if (job.attempt_count >= TRANSCRIPTION_MAX_ATTEMPTS) {
    return { status: 'failed', next_run_at: null }
  }
  const delay = TRANSCRIPTION_RETRY_DELAYS_MS[Math.max(0, job.attempt_count - 1)]
  return { status: 'retry_wait', next_run_at: new Date(now.getTime() + delay).toISOString() }
}

export async function claimNextTranscriptionJob(db, now = new Date()) {
  return db.transaction(async (trx) => {
    const job = await trx('meeting_transcription_jobs as job')
      .join('meeting_artifacts as artifact', 'artifact.id', 'job.artifact_id')
      .join('meeting_recordings as recording', 'recording.id', 'job.recording_id')
      .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
      .whereIn('job.status', ['queued', 'retry_wait'])
      .where('artifact.status', 'processing')
      .whereRaw('artifact.transcription_generation = job.generation')
      .where('meeting.status', 'ended')
      .whereIn('recording.status', ['ready', 'completed'])
      .where((query) => query.whereNull('job.next_run_at').orWhere('job.next_run_at', '<=', now))
      .orderBy('meeting.ended_at', 'asc')
      .orderBy('recording.started_at', 'asc')
      .select('job.*')
      .forUpdate('job')
      .skipLocked()
      .first()

    if (!job) return null
    const leaseToken = createId()
    const attemptCount = job.attempt_count + 1
    await trx('meeting_transcription_jobs').where('id', job.id).update({
      status: 'running',
      attempt_count: attemptCount,
      lease_token: leaseToken,
      lease_until: new Date(now.getTime() + TRANSCRIPTION_LEASE_MS).toISOString(),
      next_run_at: null,
      failure_code: null,
      failure_message: null,
      updated_at: now.toISOString()
    })
    return { ...job, status: 'running', attempt_count: attemptCount, lease_token: leaseToken }
  })
}

export async function renewTranscriptionLease(db, job, now = new Date()) {
  return db('meeting_transcription_jobs')
    .where({ id: job.id, generation: job.generation, lease_token: job.lease_token, status: 'running' })
    .update({
      lease_until: new Date(now.getTime() + TRANSCRIPTION_LEASE_MS).toISOString(),
      updated_at: now.toISOString()
    })
}

export async function recoverExpiredTranscriptionJobs(db, now = new Date()) {
  const expired = await db('meeting_transcription_jobs')
    .where('status', 'running')
    .where('lease_until', '<=', now)
    .select('*')

  for (const job of expired) {
    const state = nextAttemptState(job, now)
    await db.transaction(async (trx) => {
      const changed = await trx('meeting_transcription_jobs')
        .where({ id: job.id, status: 'running', lease_token: job.lease_token })
        .where('lease_until', '<=', now)
        .update({
          ...state,
          lease_token: null,
          lease_until: null,
          failure_code: 'worker_interrupted',
          failure_message: 'Transcription worker stopped before completing the recording',
          updated_at: now.toISOString()
        })
      if (changed && state.status === 'failed') {
        await trx('meeting_recordings').where('id', job.recording_id).update({
          status: 'failed',
          failure_code: 'transcription_failed',
          failure_message: 'Transcription worker stopped repeatedly',
          updated_at: now.toISOString()
        })
      }
    })
  }
  return expired.length
}

export async function finishTranscriptionJob(db, job, { failureCode = null, failureMessage = null, retryable = false } = {}) {
  const now = new Date()
  return db.transaction(async (trx) => {
    const current = await trx('meeting_transcription_jobs')
      .where({ id: job.id, generation: job.generation, lease_token: job.lease_token, status: 'running' })
      .forUpdate()
      .first()
    if (!current) return false
    const state = failureCode
      ? (retryable ? nextAttemptState(current, now) : { status: 'failed', next_run_at: null })
      : { status: 'completed', next_run_at: null }
    await trx('meeting_transcription_jobs').where('id', job.id).update({
      ...state,
      lease_token: null,
      lease_until: null,
      failure_code: failureCode,
      failure_message: failureMessage?.slice(0, 1000) || null,
      updated_at: now.toISOString()
    })
    if (state.status === 'completed') {
      await trx('meeting_recordings').where('id', job.recording_id).update({
        status: 'completed', failure_code: null, failure_message: null, updated_at: now.toISOString()
      })
    } else if (state.status === 'failed') {
      await trx('meeting_recordings').where('id', job.recording_id).update({
        status: 'failed',
        failure_code: failureCode === 'recording_missing' ? 'recording_missing' : 'transcription_failed',
        failure_message: failureMessage?.slice(0, 1000) || 'Transcription failed',
        updated_at: now.toISOString()
      })
    }
    return state.status
  })
}

export async function pauseTranscriptionJob(db, job) {
  return db('meeting_transcription_jobs')
    .where({ id: job.id, generation: job.generation, lease_token: job.lease_token, status: 'running' })
    .update({
      status: 'queued',
      attempt_count: Math.max(0, job.attempt_count - 1),
      lease_token: null,
      lease_until: null,
      next_run_at: null,
      updated_at: new Date().toISOString()
    })
}

export async function alignTranscriptionCheckpoint(db, job, { sourceSignature, runtimeSignature }) {
  return db.transaction(async (trx) => {
    const current = await trx('meeting_transcription_jobs')
      .where({ id: job.id, generation: job.generation, lease_token: job.lease_token, status: 'running' })
      .forUpdate()
      .first()
    if (!current) return false
    if (current.source_signature !== sourceSignature || current.runtime_signature !== runtimeSignature) {
      await trx('meeting_transcription_chunks').where('job_id', job.id).del()
      await trx('meeting_transcription_jobs').where('id', job.id).update({
        source_signature: sourceSignature,
        runtime_signature: runtimeSignature,
        updated_at: new Date().toISOString()
      })
    }
    return true
  })
}

export async function saveTranscriptionChunk(db, job, chunk) {
  return db.transaction(async (trx) => {
    const current = await trx('meeting_transcription_jobs')
      .where({ id: job.id, generation: job.generation, lease_token: job.lease_token, status: 'running' })
      .forUpdate()
      .first()
    if (!current) return false
    await trx('meeting_transcription_chunks')
      .insert({
        id: createId(),
        job_id: job.id,
        ...chunk,
        segments: JSON.stringify(chunk.segments),
        filter_summary: JSON.stringify(chunk.filter_summary)
      })
      .onConflict(['job_id', 'chunk_index'])
      .ignore()
    return true
  })
}
