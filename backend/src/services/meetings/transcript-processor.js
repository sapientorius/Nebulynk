import { upsertMeetingArtifactSearchDocument } from '../../lib/search-index.js'
import { readStoredFile } from '../../lib/storage.js'
import { transcribeAudio } from '../../lib/ai-provider-adapters.js'
import { chunkAudioBuffer, splitOnSilence } from '../../lib/audio-chunking.js'
import {
  MEETING_RECORDING_STATUS,
  MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS,
  getActiveTranscriptionRuntime,
  getRecordingSpeakerLabel,
  isTerminalMeetingRecordingStatus
} from '../../lib/meeting-recordings.js'
import { logger } from '../../logger.js'
import { reconcileMeetingRecordings } from './recordings-runtime.js'
import { processPendingMeetingSummaries } from './summary-processor.js'

const TRANSCRIPT_POLL_LIMIT = 10
const ARTIFACTS_IN_FLIGHT = new Set()
const DEFAULT_WHISPER_NO_SPEECH_DROP_THRESHOLD = 0.6
const DEFAULT_WHISPER_MIN_AVG_LOGPROB = -1.0
const DEFAULT_WHISPER_MAX_COMPRESSION_RATIO = 2.4
const SUBTITLE_CREDIT_PATTERNS = [
  /^untertitel\s+im\s+auftrag\s+des\b.+$/iu,
  /^untertitel\s+der\s+amara\.org-community$/iu,
  /^untertitel\s+von\s+[\p{L}\p{M}0-9 .,'-]+$/iu,
  /^subtitles?\s+by\s+[\p{L}\p{M}0-9 .,'-]+$/iu,
  /^caption(?:s|ing)?\s+by\s+[\p{L}\p{M}0-9 .,'-]+$/iu
]

function collapseWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseFiniteEnvNumber(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function parseBooleanEnv(value, fallback) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

function readWhisperHardeningConfig(env = process.env) {
  return {
    noSpeechDropThreshold: parseFiniteEnvNumber(
      env.WHISPER_NO_SPEECH_DROP_THRESHOLD,
      DEFAULT_WHISPER_NO_SPEECH_DROP_THRESHOLD
    ),
    minAvgLogprob: parseFiniteEnvNumber(
      env.WHISPER_MIN_AVG_LOGPROB,
      DEFAULT_WHISPER_MIN_AVG_LOGPROB
    ),
    maxCompressionRatio: parseFiniteEnvNumber(
      env.WHISPER_MAX_COMPRESSION_RATIO,
      DEFAULT_WHISPER_MAX_COMPRESSION_RATIO
    ),
    subtitleSafetyNetEnabled: parseBooleanEnv(
      env.WHISPER_ENABLE_SUBTITLE_SAFETY_NET,
      true
    )
  }
}

function isLikelySubtitleCreditHallucination(value, { subtitleSafetyNetEnabled } = readWhisperHardeningConfig()) {
  if (!subtitleSafetyNetEnabled) return false
  const normalized = collapseWhitespace(value)
  if (!normalized) return false
  return SUBTITLE_CREDIT_PATTERNS.some((pattern) => pattern.test(normalized))
}

function createFilterSummary() {
  return {
    raw_segment_count: 0,
    kept_segment_count: 0,
    dropped_no_speech_count: 0,
    dropped_compression_count: 0,
    dropped_boilerplate_count: 0
  }
}

function mergeFilterSummary(target, source) {
  if (!source) return target

  target.raw_segment_count += Number(source.raw_segment_count || 0)
  target.kept_segment_count += Number(source.kept_segment_count || 0)
  target.dropped_no_speech_count += Number(source.dropped_no_speech_count || 0)
  target.dropped_compression_count += Number(source.dropped_compression_count || 0)
  target.dropped_boilerplate_count += Number(source.dropped_boilerplate_count || 0)
  return target
}

function resolveWhisperSegmentDropReason(segment, config) {
  const noSpeechProb = Number(segment?.no_speech_prob)
  const avgLogprob = Number(segment?.avg_logprob)
  const compressionRatio = Number(segment?.compression_ratio)

  if (
    Number.isFinite(noSpeechProb)
    && Number.isFinite(avgLogprob)
    && noSpeechProb > config.noSpeechDropThreshold
    && avgLogprob < config.minAvgLogprob
  ) {
    return 'no_speech'
  }

  if (
    Number.isFinite(compressionRatio)
    && Number.isFinite(avgLogprob)
    && compressionRatio > config.maxCompressionRatio
    && avgLogprob < config.minAvgLogprob
  ) {
    return 'compression'
  }

  if (isLikelySubtitleCreditHallucination(segment?.text, config)) {
    return 'boilerplate'
  }

  return null
}

function applyWhisperSegmentFilters(segments, config) {
  const filterSummary = createFilterSummary()
  const keptSegments = []
  const droppedSegments = []

  for (const segment of segments) {
    filterSummary.raw_segment_count += 1

    const dropReason = resolveWhisperSegmentDropReason(segment, config)
    if (dropReason === 'no_speech') {
      filterSummary.dropped_no_speech_count += 1
    } else if (dropReason === 'compression') {
      filterSummary.dropped_compression_count += 1
    } else if (dropReason === 'boilerplate') {
      filterSummary.dropped_boilerplate_count += 1
    }

    if (dropReason) {
      droppedSegments.push({
        reason: dropReason,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text: segment.text,
        avg_logprob: segment.avg_logprob ?? null,
        no_speech_prob: segment.no_speech_prob ?? null,
        compression_ratio: segment.compression_ratio ?? null
      })
      continue
    }

    keptSegments.push(segment)
  }

  return {
    keptSegments,
    droppedSegments,
    filterSummary
  }
}

function toTimestampMs(value) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function resolveRecordingStart(recording, meeting) {
  const explicitStartMs = toTimestampMs(recording?.started_at)
  if (explicitStartMs > 0) {
    return {
      startedAt: recording.started_at,
      startedAtMs: explicitStartMs,
      source: 'recording.started_at'
    }
  }

  const endedAtMs = toTimestampMs(recording?.ended_at)
  const durationMs = Number(recording?.duration_ms || 0)
  if (endedAtMs > 0 && Number.isFinite(durationMs) && durationMs > 0) {
    const derivedStartMs = Math.max(0, endedAtMs - durationMs)
    return {
      startedAt: new Date(derivedStartMs).toISOString(),
      startedAtMs: derivedStartMs,
      source: 'ended_at-duration_ms'
    }
  }

  const createdAtMs = toTimestampMs(recording?.created_at)
  if (createdAtMs > 0) {
    return {
      startedAt: recording.created_at,
      startedAtMs: createdAtMs,
      source: 'recording.created_at'
    }
  }

  const meetingStartedAtMs = toTimestampMs(meeting?.started_at)
  return {
    startedAt: meeting?.started_at || null,
    startedAtMs: meetingStartedAtMs,
    source: meetingStartedAtMs > 0 ? 'meeting.started_at' : 'unknown'
  }
}

function normalizeRelativeSegment(segment, {
  offsetMs,
  speakerUserId,
  speakerLabel
}) {
  const text = collapseWhitespace(segment?.text)
  if (!text) return null

  const startMs = Math.max(0, Math.round(Number(segment?.start ?? 0) * 1000) + offsetMs)
  const endCandidateMs = Math.max(startMs, Math.round(Number(segment?.end ?? 0) * 1000) + offsetMs)

  const normalized = {
    speaker_user_id: speakerUserId,
    speaker_label: speakerLabel,
    start_ms: startMs,
    end_ms: endCandidateMs,
    text
  }

  const avgLogprob = Number(segment?.avg_logprob)
  if (Number.isFinite(avgLogprob)) {
    normalized.avg_logprob = avgLogprob
  }

  const noSpeechProb = Number(segment?.no_speech_prob)
  if (Number.isFinite(noSpeechProb)) {
    normalized.no_speech_prob = noSpeechProb
  }

  const compressionRatio = Number(segment?.compression_ratio)
  if (Number.isFinite(compressionRatio)) {
    normalized.compression_ratio = compressionRatio
  }

  return normalized
}

function buildFallbackSegment(recording, {
  offsetMs,
  durationMs,
  speakerUserId,
  speakerLabel,
  text,
  whisperHardeningConfig = readWhisperHardeningConfig()
}) {
  const normalizedText = collapseWhitespace(text)
  if (!normalizedText || isLikelySubtitleCreditHallucination(normalizedText, whisperHardeningConfig)) return null

  const resolvedDurationMs = Number(durationMs || recording?.duration_ms || 0)
  const endMs = resolvedDurationMs > 0 ? offsetMs + resolvedDurationMs : offsetMs + 1000

  return {
    speaker_user_id: speakerUserId,
    speaker_label: speakerLabel,
    start_ms: offsetMs,
    end_ms: Math.max(offsetMs, endMs),
    text: normalizedText
  }
}

function mergeSpeakerTranscriptSegments(segments) {
  const deduped = []

  for (const segment of [...segments].sort((left, right) => (
    left.start_ms === right.start_ms
      ? left.end_ms - right.end_ms
      : left.start_ms - right.start_ms
  ))) {
    const previous = deduped[deduped.length - 1]
    const normalizedText = collapseWhitespace(segment.text).toLowerCase()
    const previousText = collapseWhitespace(previous?.text || '').toLowerCase()

    if (
      previous
      && previous.speaker_user_id === segment.speaker_user_id
      && normalizedText
      && normalizedText === previousText
      && segment.start_ms <= previous.end_ms + 2500
    ) {
      previous.end_ms = Math.max(previous.end_ms, segment.end_ms)
      continue
    }

    deduped.push({ ...segment })
  }

  return deduped
}

function mergeMeetingTranscriptSegments(segments) {
  return [...segments].sort((left, right) => (
    left.start_ms === right.start_ms
      ? left.speaker_label.localeCompare(right.speaker_label)
      : left.start_ms - right.start_ms
  ))
}

function buildTranscriptWarnings(failedRecordings) {
  return failedRecordings.map((recording) => ({
    code: recording.failure_code || 'recording_failed',
    recording_id: recording.id,
    speaker_user_id: recording.user_id || null,
    speaker_label: getRecordingSpeakerLabel(recording),
    message: recording.failure_message || 'Recording segment could not be transcribed'
  }))
}

async function buildRecordingPauseWarnings(db, meeting) {
  const pauseRows = await db('meeting_recording_pauses')
    .where('meeting_id', meeting.id)
    .orderBy('paused_at', 'asc')
    .select('*')

  const meetingStartedAtMs = toTimestampMs(meeting.started_at)
  const meetingEndedAtMs = toTimestampMs(meeting.ended_at)

  return pauseRows
    .map((pause) => {
      const pausedAtMs = toTimestampMs(pause.paused_at)
      if (pausedAtMs <= 0) return null

      const resumedAtMs = toTimestampMs(pause.resumed_at) || meetingEndedAtMs || pausedAtMs
      const startMs = meetingStartedAtMs > 0 ? Math.max(0, pausedAtMs - meetingStartedAtMs) : null
      const endMs = meetingStartedAtMs > 0 ? Math.max(startMs || 0, resumedAtMs - meetingStartedAtMs) : null

      return {
        code: 'recording_paused',
        recording_id: null,
        speaker_user_id: null,
        speaker_label: null,
        paused_by: pause.paused_by || null,
        resumed_by: pause.resumed_by || null,
        paused_at: pause.paused_at || null,
        resumed_at: pause.resumed_at || null,
        start_ms: startMs,
        end_ms: endMs,
        message: 'Transcription recording was paused for part of the meeting'
      }
    })
    .filter(Boolean)
}

function buildTranscriptText(segments) {
  return segments
    .map((segment) => `${segment.speaker_label}: ${segment.text}`)
    .join('\n')
}

function isSegmentDebugEnabled() {
  return process.env.MEETING_TRANSCRIPT_SEGMENT_DEBUG === 'true'
}

function previewText(value, limit = 120) {
  const normalized = collapseWhitespace(value)
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function chooseTranscriptLanguage(transcripts) {
  const counts = new Map()

  for (const transcript of transcripts) {
    const language = collapseWhitespace(transcript.language || '')
    if (!language) continue
    counts.set(language, (counts.get(language) || 0) + 1)
  }

  let winner = null
  let winnerCount = -1
  for (const [language, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = language
      winnerCount = count
    }
  }

  return winner
}

function buildMistralContextBias({ meeting, sourceChannel, recordings }) {
  const participantNames = [...new Set((recordings || [])
    .map((recording) => getRecordingSpeakerLabel(recording))
    .filter(Boolean))]

  const parts = [
    meeting?.title ? `Meeting title: ${meeting.title}` : null,
    sourceChannel?.name ? `Source channel: ${sourceChannel.name}` : null,
    participantNames.length > 0 ? `Participants: ${participantNames.join(', ')}` : null
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : null
}

async function loadTranscriptCandidates(db) {
  const artifacts = await db('meeting_artifacts')
    .where('artifact_type', 'transcript')
    .orderBy('updated_at', 'asc')
    .select('*')

  return artifacts
    .filter((artifact) => artifact.status === 'pending' || artifact.status === 'processing')
    .slice(0, TRANSCRIPT_POLL_LIMIT)
}

async function markTimedOutRecordingsFailed(db, recordings) {
  const timedOut = recordings.filter((recording) => !isTerminalMeetingRecordingStatus(recording.status))
  if (timedOut.length === 0) {
    return recordings
  }

  const nowIso = new Date().toISOString()
  for (const recording of timedOut) {
    await db('meeting_recordings')
      .where('id', recording.id)
      .update({
        status: MEETING_RECORDING_STATUS.FAILED,
        ended_at: recording.ended_at || nowIso,
        failure_code: recording.failure_code || 'recording_timeout',
        failure_message: recording.failure_message || 'Recording did not finish before transcript timeout',
        updated_at: nowIso
      })
  }

  return db('meeting_recordings').where('meeting_id', timedOut[0].meeting_id).select('*')
}

async function transcribeMeetingRecording({
  runtime,
  recording,
  meeting,
  sourceChannel,
  allRecordings,
  storageClient
}) {
  const whisperHardeningConfig = readWhisperHardeningConfig()
  const speakerLabel = getRecordingSpeakerLabel(recording)
  const speakerUserId = recording.user_id || null
  const meetingStartMs = toTimestampMs(meeting?.started_at) || Date.now()
  const resolvedRecordingStart = resolveRecordingStart(recording, meeting)
  const recordingStartMs = resolvedRecordingStart.startedAtMs || meetingStartMs
  const recordingOffsetMs = Math.max(0, recordingStartMs - meetingStartMs)
  const contextBias = runtime.providerInstance.provider_type === 'mistral'
    ? buildMistralContextBias({ meeting, sourceChannel, recordings: allRecordings })
    : null

  const storedFile = await readStoredFile(storageClient, {
    bucket: recording.storage_bucket,
    key: recording.storage_key
  })
  const storedMime = storedFile.mime || recording.mime_type

  const speechChunks = await splitOnSilence({
    buffer: storedFile.buffer,
    mimeType: storedMime
  })

  const chunks = []
  for (const speechChunk of speechChunks) {
    const sizeChunks = await chunkAudioBuffer({
      buffer: speechChunk.buffer,
      mimeType: speechChunk.mime,
      providerType: runtime.providerInstance.provider_type
    })
    for (const sizeChunk of sizeChunks) {
      chunks.push({
        ...sizeChunk,
        offsetMs: speechChunk.offsetMs + sizeChunk.offsetMs,
        durationMs: sizeChunk.durationMs ?? speechChunk.durationMs
      })
    }
  }

  if (chunks.length === 0) {
    chunks.push({
      buffer: storedFile.buffer,
      mime: storedMime,
      offsetMs: 0,
      durationMs: null
    })
  }

  const recordingStartGapMs = Math.max(0, recordingOffsetMs)

  logger.info('Preparing meeting recording transcription', {
    meetingId: meeting?.id || null,
    recordingId: recording.id,
    userId: speakerUserId,
    speakerLabel,
    providerType: runtime.providerInstance.provider_type,
    model: runtime.functionConfig.model,
    meetingStartedAt: meeting?.started_at || null,
    recordingStartedAt: resolvedRecordingStart.startedAt,
    recordingStartSource: resolvedRecordingStart.source,
    recordingEndedAt: recording.ended_at || null,
    recordingDurationMs: recording.duration_ms || null,
    recordingStartGapMs,
    storageMime: storedMime || null,
    speechChunkCount: speechChunks.length,
    speechChunkOffsetsMs: speechChunks.map((chunk) => chunk.offsetMs),
    speechChunkDurationsMs: speechChunks.map((chunk) => chunk.durationMs ?? null),
    chunkCount: chunks.length,
    chunkOffsetsMs: chunks.map((chunk) => chunk.offsetMs),
    chunkDurationsMs: chunks.map((chunk) => chunk.durationMs ?? null)
  })

  if (recordingStartGapMs > 1500) {
    logger.warn('Meeting recording started noticeably after meeting start', {
      meetingId: meeting?.id || null,
      recordingId: recording.id,
      userId: speakerUserId,
      speakerLabel,
      recordingStartGapMs,
      meetingStartedAt: meeting?.started_at || null,
      recordingStartedAt: resolvedRecordingStart.startedAt,
      recordingStartSource: resolvedRecordingStart.source
    })
  }

  let language = null
  const normalizedSegments = []
  const filterSummary = createFilterSummary()
  for (const chunk of chunks) {
    const transcript = await transcribeAudio({
      providerType: runtime.providerInstance.provider_type,
      apiKey: runtime.apiKey,
      baseUrl: runtime.providerInstance.base_url,
      model: runtime.functionConfig.model,
      file: {
        buffer: chunk.buffer,
        mime: chunk.mime
      },
      contextBias,
      language: meeting.language || null
    })

    if (!language && transcript.language) {
      language = transcript.language
    }

    const chunkOffsetMs = recordingOffsetMs + chunk.offsetMs
    const rawChunkSegments = Array.isArray(transcript.segments) && transcript.segments.length > 0
      ? transcript.segments
        .map((segment) => normalizeRelativeSegment(segment, {
          offsetMs: chunkOffsetMs,
          speakerUserId,
          speakerLabel
        }))
        .filter(Boolean)
      : []
    const {
      keptSegments: chunkSegments,
      droppedSegments,
      filterSummary: chunkFilterSummary
    } = applyWhisperSegmentFilters(rawChunkSegments, whisperHardeningConfig)

    mergeFilterSummary(filterSummary, chunkFilterSummary)

    if (isSegmentDebugEnabled()) {
      logger.info('Meeting recording transcript chunk detail', {
        meetingId: meeting?.id || null,
        recordingId: recording.id,
        userId: speakerUserId,
        speakerLabel,
        chunkOffsetMs,
        chunkDurationMs: chunk.durationMs ?? null,
        rawTranscriptText: previewText(transcript.text),
        droppedSegments: droppedSegments.map((segment) => ({
          reason: segment.reason,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          text: previewText(segment.text, 80),
          avg_logprob: segment.avg_logprob,
          no_speech_prob: segment.no_speech_prob,
          compression_ratio: segment.compression_ratio
        })),
        rawSegments: chunkSegments.map((segment) => ({
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          text: previewText(segment.text, 80),
          avg_logprob: segment.avg_logprob ?? null,
          no_speech_prob: segment.no_speech_prob ?? null,
          compression_ratio: segment.compression_ratio ?? null
        }))
      })
    }

    if (rawChunkSegments.length === 0) {
      const fallback = buildFallbackSegment(recording, {
        offsetMs: chunkOffsetMs,
        durationMs: chunk.durationMs,
        speakerUserId,
        speakerLabel,
        text: transcript.text,
        whisperHardeningConfig
      })
      if (fallback) {
        normalizedSegments.push(fallback)
        filterSummary.kept_segment_count += 1
      }
      continue
    }

    normalizedSegments.push(...chunkSegments)
  }

  const mergedSegments = mergeSpeakerTranscriptSegments(normalizedSegments)
  filterSummary.kept_segment_count = mergedSegments.length

  if (isSegmentDebugEnabled()) {
    logger.info('Meeting recording merged transcript detail', {
      meetingId: meeting?.id || null,
      recordingId: recording.id,
      userId: speakerUserId,
      speakerLabel,
      mergedSegments: mergedSegments.map((segment) => ({
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        text: previewText(segment.text, 80)
      }))
    })
  }

  if (mergedSegments.length === 0) {
    throw new Error('Transcript response did not contain any usable segments')
  }

  return {
    recording_id: recording.id,
    user_id: speakerUserId,
    speaker_label: speakerLabel,
    language,
    segments: mergedSegments,
    filter_summary: filterSummary
  }
}

async function finalizeTranscriptArtifact(app, artifact, {
  meeting,
  successfulTranscripts,
  failedRecordings
}) {
  const db = app.get('postgresqlClient')
  const nowIso = new Date().toISOString()
  const allSegments = mergeMeetingTranscriptSegments(successfulTranscripts.flatMap((item) => item.segments))
  const filterSummary = successfulTranscripts.reduce((summary, transcript) => (
    mergeFilterSummary(summary, transcript.filter_summary)
  ), createFilterSummary())
  const warnings = [
    ...buildTranscriptWarnings(failedRecordings),
    ...await buildRecordingPauseWarnings(db, meeting)
  ]

  if (allSegments.length === 0) {
    await db('meeting_artifacts')
      .where('id', artifact.id)
      .update({
        status: 'failed',
        payload: {
          warnings
        },
        updated_at: nowIso
      })
    return false
  }

  const payload = {
    text: buildTranscriptText(allSegments),
    language: meeting.language || chooseTranscriptLanguage(successfulTranscripts),
    detected_language: chooseTranscriptLanguage(successfulTranscripts),
    segments: allSegments,
    filter_summary: filterSummary,
    warnings,
    completeness: warnings.length > 0 ? 'partial' : 'complete'
  }

  await db.transaction(async (trx) => {
    await trx('meeting_artifacts')
      .where('id', artifact.id)
      .update({
        status: 'ready',
        payload,
        updated_at: nowIso
      })

    const successfulRecordingIds = successfulTranscripts.map((item) => item.recording_id)
    if (successfulRecordingIds.length > 0) {
      await trx('meeting_recordings')
        .whereIn('id', successfulRecordingIds)
        .update({
          status: MEETING_RECORDING_STATUS.COMPLETED,
          failure_code: null,
          failure_message: null,
          updated_at: nowIso
        })
    }
  })

  const upsertArtifactSearchDocument = app.get('upsertMeetingArtifactSearchDocument') || upsertMeetingArtifactSearchDocument
  await upsertArtifactSearchDocument(db, artifact.id)

  app.service('meetings').emit('artifacts-updated', {
    meetingId: meeting.id,
    chatChannelId: meeting.chat_channel_id,
    artifactTypes: ['transcript']
  })

  await processPendingMeetingSummaries(app)

  return true
}

async function failTranscriptArtifact(app, artifact, meeting, failedRecordings) {
  const db = app.get('postgresqlClient')
  const nowIso = new Date().toISOString()
  const warnings = [
    ...buildTranscriptWarnings(failedRecordings),
    ...await buildRecordingPauseWarnings(db, meeting)
  ]

  await db('meeting_artifacts')
    .where('id', artifact.id)
    .update({
      status: 'failed',
      payload: {
        warnings
      },
      updated_at: nowIso
    })

  const upsertArtifactSearchDocument = app.get('upsertMeetingArtifactSearchDocument') || upsertMeetingArtifactSearchDocument
  await upsertArtifactSearchDocument(db, artifact.id)

  app.service('meetings').emit('artifacts-updated', {
    meetingId: meeting.id,
    chatChannelId: meeting.chat_channel_id,
    artifactTypes: ['transcript']
  })

  await processPendingMeetingSummaries(app)
}

export async function processPendingMeetingTranscripts(app) {
  const db = app.get('postgresqlClient')
  const storageClient = app.get('storageClient')
  if (!storageClient) {
    return 0
  }

  const runtime = await getActiveTranscriptionRuntime(db, app)
  if (!runtime) {
    return 0
  }

  const candidates = await loadTranscriptCandidates(db)
  let processed = 0

  for (const artifact of candidates) {
    if (ARTIFACTS_IN_FLIGHT.has(artifact.id)) {
      continue
    }

    ARTIFACTS_IN_FLIGHT.add(artifact.id)

    try {
      const meeting = await db('meetings').where('id', artifact.meeting_id).first()
      if (!meeting || meeting.status !== 'ended') {
        continue
      }

      await reconcileMeetingRecordings(app, { meetingId: meeting.id })
      let recordings = await db('meeting_recordings').where('meeting_id', meeting.id).select('*')

      if (recordings.length === 0) {
        await failTranscriptArtifact(app, artifact, meeting, [])
        processed += 1
        continue
      }

      const waitDeadlineMs = toTimestampMs(meeting.ended_at || meeting.updated_at) + MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS
      const nowMs = Date.now()
      const hasPendingRecordings = recordings.some((recording) => !isTerminalMeetingRecordingStatus(recording.status))

      if (hasPendingRecordings && nowMs < waitDeadlineMs) {
        continue
      }

      if (hasPendingRecordings) {
        recordings = await markTimedOutRecordingsFailed(db, recordings)
      }

      const sourceChannel = meeting.source_channel_id
        ? await db('channels').where('id', meeting.source_channel_id).first()
        : null

      const successfulTranscripts = []
      const failedRecordings = recordings
        .filter((recording) => recording.status === MEETING_RECORDING_STATUS.FAILED)
        .map((recording) => ({ ...recording }))

      const readyRecordings = recordings.filter((recording) => recording.status === MEETING_RECORDING_STATUS.READY)
      for (const recording of readyRecordings) {
        try {
          const transcript = await transcribeMeetingRecording({
            runtime,
            recording,
            meeting,
            sourceChannel,
            allRecordings: recordings,
            storageClient
          })
          successfulTranscripts.push(transcript)
        } catch (error) {
          logger.warn('Meeting recording transcription failed', {
            meetingId: meeting.id,
            recordingId: recording.id,
            error: error.message
          })

          const nowIso = new Date().toISOString()
          await db('meeting_recordings')
            .where('id', recording.id)
            .update({
              status: MEETING_RECORDING_STATUS.FAILED,
              failure_code: 'transcription_failed',
              failure_message: error.message,
              updated_at: nowIso
            })

          failedRecordings.push({
            ...recording,
            status: MEETING_RECORDING_STATUS.FAILED,
            failure_code: 'transcription_failed',
            failure_message: error.message
          })
        }
      }

      if (successfulTranscripts.length === 0) {
        await failTranscriptArtifact(app, artifact, meeting, failedRecordings)
        processed += 1
        continue
      }

      await finalizeTranscriptArtifact(app, artifact, {
        meeting,
        successfulTranscripts,
        failedRecordings
      })
      processed += 1
    } finally {
      ARTIFACTS_IN_FLIGHT.delete(artifact.id)
    }
  }

  return processed
}

export {
  buildTranscriptText,
  isLikelySubtitleCreditHallucination,
  mergeMeetingTranscriptSegments,
  mergeSpeakerTranscriptSegments,
  resolveWhisperSegmentDropReason
}
