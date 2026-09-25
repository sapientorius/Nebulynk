import { createId } from '@paralleldrive/cuid2'
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { transcribeAudio } from '../../lib/ai-provider-adapters.js'
import {
  detectSilenceIntervals,
  downloadRecordingToTemp,
  iterateBoundedAudioChunks,
  planBoundedSpeechChunks,
  probeRecordingDuration
} from '../../lib/streamed-meeting-audio.js'
import { getActiveTranscriptionRuntime, getRecordingSpeakerLabel, MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS } from '../../lib/meeting-recordings.js'
import { logger } from '../../logger.js'
import {
  alignTranscriptionCheckpoint,
  claimNextTranscriptionJob,
  finishTranscriptionJob,
  pauseTranscriptionJob,
  recoverExpiredTranscriptionJobs,
  renewTranscriptionLease,
  saveTranscriptionChunk,
  queueTranscriptRecordingJobs
} from './transcription-jobs.js'
import {
  applyWhisperSegmentFilters,
  buildFallbackSegment,
  buildMistralContextBias,
  buildRecordingPauseWarnings,
  buildTranscriptText,
  buildTranscriptWarnings,
  chooseTranscriptLanguage,
  createFilterSummary,
  mergeFilterSummary,
  mergeMeetingTranscriptSegments,
  mergeSpeakerTranscriptSegments,
  normalizeRelativeSegment,
  readWhisperHardeningConfig,
  resolveRecordingStart
} from './transcript-processor.js'

function timestampMs(value) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function errorCode(error) {
  const status = Number(String(error?.message || '').match(/^(\d{3})\b/)?.[1] || error?.$metadata?.httpStatusCode)
  if (status === 404 || ['NoSuchKey', 'NoSuchBucket', 'NotFound'].includes(error?.name)) return 'recording_missing'
  if (error?.code === 'recording_too_large') return 'recording_too_large'
  if (error?.code === 'recording_missing') return 'recording_missing'
  if (error?.code === 'recording_invalid') return 'recording_invalid'
  if (error?.code === 'recording_download_timeout') return 'recording_download_timeout'
  if ([400, 401, 403, 413, 422].includes(status)) return 'provider_rejected'
  if (status === 429) return 'provider_rate_limited'
  if (status >= 500) return 'provider_unavailable'
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'provider_timeout'
  if (error?.code === 'temporary_disk_full') return 'temporary_disk_full'
  return 'transcription_failed'
}

function isRetryableCode(code) {
  return !['recording_missing', 'recording_too_large', 'recording_invalid', 'provider_rejected'].includes(code)
}

function runtimeSignature(runtime) {
  return createHash('sha256').update(JSON.stringify([
    runtime.providerInstance.id,
    runtime.providerInstance.provider_type,
    runtime.providerInstance.base_url || '',
    runtime.functionConfig.model
  ])).digest('hex')
}

async function loadJobContext(db, job) {
  const artifact = await db('meeting_artifacts').where('id', job.artifact_id).first()
  if (!artifact || artifact.transcription_generation !== job.generation || artifact.status !== 'processing') return null
  const meeting = await db('meetings').where('id', artifact.meeting_id).first()
  const recording = await db('meeting_recordings').where('id', job.recording_id).first()
  if (!meeting || !recording) return null
  const sourceChannel = meeting.source_channel_id
    ? await db('channels').where('id', meeting.source_channel_id).first()
    : null
  const allRecordings = await db('meeting_recordings').where('meeting_id', meeting.id).select('*')
  return { artifact, meeting, recording, sourceChannel, allRecordings }
}

function normalizeChunkResult(transcript, chunk, { recording, meeting }) {
  const speakerUserId = recording.user_id || null
  const speakerLabel = getRecordingSpeakerLabel(recording)
  const meetingStartMs = timestampMs(meeting.started_at)
  const recordingStartMs = resolveRecordingStart(recording, meeting).startedAtMs || meetingStartMs
  const offsetMs = Math.max(0, recordingStartMs - meetingStartMs) + chunk.offsetMs
  const raw = Array.isArray(transcript.segments) && transcript.segments.length > 0
    ? transcript.segments.map((segment) => normalizeRelativeSegment(segment, {
      offsetMs, speakerUserId, speakerLabel
    })).filter(Boolean)
    : []
  const filtered = applyWhisperSegmentFilters(raw, readWhisperHardeningConfig())
  const segments = [...filtered.keptSegments]
  if (raw.length === 0) {
    const fallback = buildFallbackSegment(recording, {
      offsetMs,
      durationMs: chunk.durationMs,
      speakerUserId,
      speakerLabel,
      text: transcript.text
    })
    if (fallback) {
      segments.push(fallback)
      filtered.filterSummary.kept_segment_count += 1
    }
  }
  return { segments, filterSummary: filtered.filterSummary }
}

export async function processClaimedTranscriptionJob({
  db,
  app,
  storageClient,
  job,
  transcribe = transcribeAudio,
  media = {}
}) {
  const context = await loadJobContext(db, job)
  if (!context) return false
  const { recording, meeting, sourceChannel, allRecordings } = context
  const abortController = new AbortController()
  let renewing = false
  let source = null
  const heartbeat = setInterval(async () => {
    if (renewing) return
    renewing = true
    try {
      const updated = await renewTranscriptionLease(db, job)
      if (!updated) abortController.abort()
    } catch (error) {
      logger.warn('Transcription lease renewal failed', { jobId: job.id, error: error.message })
      abortController.abort()
    } finally {
      renewing = false
    }
  }, 30_000)

  try {
    const runtime = await getActiveTranscriptionRuntime(db, app)
    if (!runtime) {
      await pauseTranscriptionJob(db, job)
      return false
    }
    if (!recording.storage_bucket || !recording.storage_key) {
      const error = new Error('Recording has no stored audio object')
      error.code = 'recording_missing'
      throw error
    }
    const downloadTimeout = AbortSignal.timeout(600_000)
    try {
      source = await (media.download || downloadRecordingToTemp)(storageClient, recording, {
        signal: AbortSignal.any([abortController.signal, downloadTimeout])
      })
    } catch (error) {
      if (downloadTimeout.aborted && !abortController.signal.aborted) {
        const timeout = new Error('Recording download exceeded ten minutes', { cause: error })
        timeout.code = 'recording_download_timeout'
        throw timeout
      }
      throw error
    }
    const signature = runtimeSignature(runtime)
    const duration = await (media.probe || probeRecordingDuration)(source.path, { signal: abortController.signal })
    const silences = await (media.detect || detectSilenceIntervals)(source.path, duration, { signal: abortController.signal })
    const plan = planBoundedSpeechChunks(duration, silences)
    const sourceAndPlanSignature = createHash('sha256')
      .update(JSON.stringify({ source: source.signature, plan, encoder: 'ogg-opus-64k-v1' }))
      .digest('hex')
    if (!await alignTranscriptionCheckpoint(db, job, {
      sourceSignature: sourceAndPlanSignature,
      runtimeSignature: signature
    })) return false
    const completed = new Set((await db('meeting_transcription_chunks')
      .where('job_id', job.id)
      .select('chunk_index')).map((row) => row.chunk_index))
    const contextBias = runtime.providerInstance.provider_type === 'mistral'
      ? buildMistralContextBias({ meeting, sourceChannel, recordings: allRecordings })
      : null

    for await (const chunk of (media.iterate || iterateBoundedAudioChunks)(source.path, source.directory, plan, {
      signal: abortController.signal
    })) {
      if (abortController.signal.aborted) throw new Error('Transcription lease lost')
      if (completed.has(chunk.index)) continue
      const activeRuntime = await getActiveTranscriptionRuntime(db, app)
      if (!activeRuntime || runtimeSignature(activeRuntime) !== signature) {
        await pauseTranscriptionJob(db, job)
        return false
      }
      const signal = AbortSignal.any([abortController.signal, AbortSignal.timeout(300_000)])
      const transcript = await transcribe({
        providerType: runtime.providerInstance.provider_type,
        apiKey: runtime.apiKey,
        baseUrl: runtime.providerInstance.base_url,
        model: runtime.functionConfig.model,
        file: { buffer: chunk.buffer, mime: chunk.mime },
        contextBias,
        language: meeting.language || null,
        signal
      })
      const normalized = normalizeChunkResult(transcript, chunk, { recording, meeting })
      const saved = await saveTranscriptionChunk(db, job, {
        chunk_index: chunk.index,
        start_ms: chunk.offsetMs,
        end_ms: chunk.offsetMs + chunk.durationMs,
        language: transcript.language || null,
        segments: normalized.segments,
        filter_summary: normalized.filterSummary
      })
      if (!saved) return false
      logger.info('Meeting transcription chunk completed', {
        meetingId: meeting.id,
        recordingId: recording.id,
        jobId: job.id,
        chunkIndex: chunk.index,
        rssBytes: process.memoryUsage().rss
      })
    }

    const chunkRows = await db('meeting_transcription_chunks')
      .where('job_id', job.id)
      .orderBy('chunk_index', 'asc')
      .select('segments')
    if (mergeSpeakerTranscriptSegments(chunkRows.flatMap((row) => row.segments || [])).length === 0) {
      throw new Error('Transcript response did not contain any usable segments')
    }
    await finishTranscriptionJob(db, job)
    return true
  } catch (error) {
    if (abortController.signal.aborted) return false
    const code = errorCode(error)
    logger.warn('Meeting recording transcription failed', {
      meetingId: meeting.id,
      recordingId: recording.id,
      jobId: job.id,
      code,
      attempt: job.attempt_count,
      error: error.message
    })
    await finishTranscriptionJob(db, job, {
      failureCode: code,
      failureMessage: error.message,
      retryable: isRetryableCode(code)
    })
    return false
  } finally {
    clearInterval(heartbeat)
    if (source) await rm(source.directory, { recursive: true, force: true })
  }
}

export async function settleUnavailableTranscriptionJobs(db, now = new Date()) {
  const rows = await db('meeting_transcription_jobs as job')
    .join('meeting_recordings as recording', 'recording.id', 'job.recording_id')
    .join('meeting_artifacts as artifact', 'artifact.id', 'job.artifact_id')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .whereIn('job.status', ['queued', 'retry_wait'])
    .where('artifact.status', 'processing')
    .whereRaw('artifact.transcription_generation = job.generation')
    .where('meeting.status', 'ended')
    .select('job.id', 'job.recording_id', 'recording.status as recording_status',
      'recording.failure_code as recording_failure_code', 'recording.failure_message as recording_failure_message',
      'meeting.ended_at as meeting_ended_at', 'meeting.updated_at as meeting_updated_at')
    .limit(100)

  for (const row of rows) {
    const deadline = timestampMs(row.meeting_ended_at || row.meeting_updated_at) + MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS
    if (row.recording_status !== 'failed' && (deadline === 0 || now.getTime() < deadline)) continue
    if (row.recording_status === 'ready' || row.recording_status === 'completed') continue
    const timedOut = row.recording_status !== 'failed'
    await db.transaction(async (trx) => {
      if (timedOut) {
        await trx('meeting_recordings').where('id', row.recording_id).update({
          status: 'failed',
          failure_code: 'recording_timeout',
          failure_message: 'Recording did not finish before transcript timeout',
          updated_at: now.toISOString()
        })
      }
      await trx('meeting_transcription_jobs').where('id', row.id).whereIn('status', ['queued', 'retry_wait']).update({
        status: 'failed',
        failure_code: timedOut ? 'recording_timeout' : (row.recording_failure_code || 'recording_failed'),
        failure_message: timedOut ? 'Recording did not finish before transcript timeout' : row.recording_failure_message,
        next_run_at: null,
        updated_at: now.toISOString()
      })
    })
  }
  return rows.length
}

export async function finalizeEligibleTranscripts(db) {
  const candidates = await db('meeting_artifacts as artifact')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .where('artifact.artifact_type', 'transcript')
    .where('artifact.status', 'processing')
    .whereNotNull('artifact.transcription_generation')
    .where('meeting.status', 'ended')
    .whereNotExists(function () {
      this.select(db.raw('1'))
        .from('meeting_transcription_jobs as open_job')
        .whereRaw('open_job.artifact_id = artifact.id AND open_job.generation = artifact.transcription_generation')
        .whereNotIn('open_job.status', ['completed', 'failed'])
    })
    .orderBy('artifact.updated_at', 'asc')
    .limit(20)
    .select('artifact.*', 'meeting.chat_channel_id', 'meeting.language', 'meeting.started_at', 'meeting.ended_at')
  let finalized = 0
  for (const artifact of candidates) {
    const jobs = await db('meeting_transcription_jobs')
      .where({ artifact_id: artifact.id, generation: artifact.transcription_generation })
      .select('*')
    const recordings = await db('meeting_recordings').where('meeting_id', artifact.meeting_id).select('*')
    if (jobs.length === 0 && recordings.length > 0) {
      await db.transaction(async (trx) => {
        const current = await trx('meeting_artifacts').where('id', artifact.id).forUpdate().first()
        if (current?.status !== 'processing' || current.transcription_generation !== artifact.transcription_generation) return
        const existing = await trx('meeting_transcription_jobs')
          .where({ artifact_id: artifact.id, generation: artifact.transcription_generation })
          .first()
        if (!existing) await queueTranscriptRecordingJobs(trx, {
          artifactId: artifact.id,
          meetingId: artifact.meeting_id,
          generation: artifact.transcription_generation
        })
      })
      continue
    }
    if (jobs.some((job) => !['completed', 'failed'].includes(job.status))) continue
    const jobsWithChunks = jobs.filter((job) => ['completed', 'failed'].includes(job.status))
    const chunks = jobsWithChunks.length > 0
      ? await db('meeting_transcription_chunks')
        .whereIn('job_id', jobsWithChunks.map((job) => job.id))
        .orderBy('chunk_index', 'asc')
        .select('*')
      : []
    const chunksByJob = new Map()
    for (const chunk of chunks) {
      if (!chunksByJob.has(chunk.job_id)) chunksByJob.set(chunk.job_id, [])
      chunksByJob.get(chunk.job_id).push(chunk)
    }
    const transcripts = jobsWithChunks.map((job) => {
      const recording = recordings.find((row) => row.id === job.recording_id)
      const chunkRows = chunksByJob.get(job.id) || []
      const segments = mergeSpeakerTranscriptSegments(chunkRows.flatMap((row) => row.segments || []))
      const filterSummary = chunkRows.reduce((summary, row) => mergeFilterSummary(summary, row.filter_summary), createFilterSummary())
      filterSummary.kept_segment_count = segments.length
      return {
        recording_id: job.recording_id,
        language: chunkRows.find((row) => row.language)?.language || null,
        segments,
        filter_summary: filterSummary,
        speaker_label: getRecordingSpeakerLabel(recording)
      }
    })
    const allSegments = mergeMeetingTranscriptSegments(transcripts.flatMap((item) => item.segments))
    const failedRecordings = recordings.filter((recording) => jobs.some((job) => job.recording_id === recording.id && job.status === 'failed'))
    const warnings = [
      ...buildTranscriptWarnings(failedRecordings),
      ...await buildRecordingPauseWarnings(db, { id: artifact.meeting_id, started_at: artifact.started_at, ended_at: artifact.ended_at })
    ]
    if (recordings.length === 0) warnings.push({ code: 'no_recordings', message: 'Meeting has no recordings' })
    const detectedLanguage = chooseTranscriptLanguage(transcripts)
    const payload = allSegments.length > 0
      ? {
          text: buildTranscriptText(allSegments),
          language: artifact.language || detectedLanguage,
          detected_language: detectedLanguage,
          segments: allSegments,
          filter_summary: transcripts.reduce((summary, item) => mergeFilterSummary(summary, item.filter_summary), createFilterSummary()),
          warnings,
          completeness: warnings.length > 0 ? 'partial' : 'complete'
        }
      : { warnings }
    const changed = await db.transaction(async (trx) => {
      const updated = await trx('meeting_artifacts')
        .where({ id: artifact.id, status: 'processing', transcription_generation: artifact.transcription_generation })
        .update({ status: allSegments.length > 0 ? 'ready' : 'failed', payload, updated_at: new Date().toISOString() })
      if (!updated) return false
      await trx('meeting_transcription_events').insert({
        id: createId(),
        artifact_id: artifact.id,
        generation: artifact.transcription_generation,
        meeting_id: artifact.meeting_id
      }).onConflict(['artifact_id', 'generation']).ignore()
      return true
    })
    if (changed) finalized += 1
  }
  return finalized
}

export async function runTranscriptionWorkerTick({ db, app, storageClient, transcribe = transcribeAudio }) {
  await recoverExpiredTranscriptionJobs(db)
  await settleUnavailableTranscriptionJobs(db)
  await finalizeEligibleTranscripts(db)
  const runtime = await getActiveTranscriptionRuntime(db, app)
  if (!runtime) return false
  const job = await claimNextTranscriptionJob(db)
  if (!job) return false
  await processClaimedTranscriptionJob({ db, app, storageClient, job, transcribe })
  await finalizeEligibleTranscripts(db)
  return true
}
