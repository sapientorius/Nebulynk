import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isLikelySubtitleCreditHallucination,
  processPendingMeetingTranscripts,
  mergeSpeakerTranscriptSegments,
  resolveWhisperSegmentDropReason
} from '../src/services/meetings/transcript-processor.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

const originalFetch = globalThis.fetch

function createApp({ seed, fileBodiesByKey = {} } = {}) {
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'instance-1',
      model: 'whisper-1',
      updated_at: '2026-03-24T10:00:00.000Z'
    }],
    ai_provider_instances: [{
      id: 'instance-1',
      provider_type: 'openai',
      display_name: 'OpenAI',
      enabled: true,
      base_url: 'https://api.openai.com/v1',
      created_at: '2026-03-24T10:00:00.000Z',
      updated_at: '2026-03-24T10:00:00.000Z'
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'instance-1',
      encrypted_secret: encryptSecret({
        get(name) {
          if (name === 'authentication') return { secret: 'test-auth-secret' }
          return null
        }
      }, 'secret-key'),
      created_at: '2026-03-24T10:00:00.000Z',
      updated_at: '2026-03-24T10:00:00.000Z'
    }],
    ...seed
  })

  const emitted = []
  const searchUpdates = []

  for (const meeting of db.tables.meetings) {
    if (!meeting.language) {
      meeting.language = 'en'
    }
  }

  return {
    db,
    emitted,
    searchUpdates,
    app: {
      get(name) {
        if (name === 'postgresqlClient') return db
        if (name === 'storageClient') {
          return {
            async send(command) {
              const key = command?.input?.Key
              const bytes = fileBodiesByKey[key] || [1, 2, 3]
              return {
                ContentType: 'audio/mp4',
                ContentLength: bytes.length,
                Body: {
                  async transformToByteArray() {
                    return Uint8Array.from(bytes)
                  }
                }
              }
            }
          }
        }
        if (name === 'upsertMeetingArtifactSearchDocument') {
          return async (database, artifactId) => {
            searchUpdates.push(artifactId)
            database.tables.search_documents.push({
              id: `meeting_transcript:${artifactId}`,
              document_id: artifactId
            })
          }
        }
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      },
      service(name) {
        if (name === 'meetings') {
          return {
            emit(eventName, payload) {
              emitted.push({ eventName, payload })
            }
          }
        }
        throw new Error(`Unexpected service: ${name}`)
      }
    }
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test('processPendingMeetingTranscripts merges speaker fragments and preserves partial warnings', async () => {
  const { app, db, emitted, searchUpdates } = createApp({
    seed: {
      meetings: [{
        id: 'meeting-1',
        title: 'Weekly Sync',
        language: 'fr',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:30:00.000Z',
        updated_at: '2026-03-24T10:30:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_recordings: [{
        id: 'recording-1',
        meeting_id: 'meeting-1',
        user_id: 'user-1',
        participant_identity: 'user-1',
        participant_display_name: 'Alex',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-1/user-1/recording-1.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 4000,
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:00:04.000Z',
        created_at: '2026-03-24T10:00:00.000Z',
        updated_at: '2026-03-24T10:30:10.000Z'
      }, {
        id: 'recording-2',
        meeting_id: 'meeting-1',
        user_id: 'user-2',
        participant_identity: 'user-2',
        participant_display_name: 'Sam',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-1/user-2/recording-2.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 3000,
        started_at: '2026-03-24T10:00:05.000Z',
        ended_at: '2026-03-24T10:00:08.000Z',
        created_at: '2026-03-24T10:00:05.000Z',
        updated_at: '2026-03-24T10:30:10.000Z'
      }, {
        id: 'recording-3',
        meeting_id: 'meeting-1',
        user_id: 'user-3',
        participant_identity: 'user-3',
        participant_display_name: 'Lee',
        status: 'failed',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-1/user-3/recording-3.mp4',
        mime_type: 'audio/mp4',
        duration_ms: null,
        started_at: null,
        ended_at: '2026-03-24T10:00:09.000Z',
        failure_code: 'egress_failed',
        failure_message: 'participant disconnected before publish',
        created_at: '2026-03-24T10:00:09.000Z',
        updated_at: '2026-03-24T10:30:10.000Z'
      }],
      meeting_recording_pauses: [{
        id: 'pause-1',
        meeting_id: 'meeting-1',
        paused_by: 'host-1',
        resumed_by: 'host-1',
        paused_at: '2026-03-24T10:00:10.000Z',
        resumed_at: '2026-03-24T10:00:20.000Z',
        created_at: '2026-03-24T10:00:10.000Z',
        updated_at: '2026-03-24T10:00:20.000Z'
      }],
      meeting_artifacts: [{
        id: 'artifact-1',
        meeting_id: 'meeting-1',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: '2026-03-24T10:30:00.000Z',
        updated_at: '2026-03-24T10:30:00.000Z'
      }]
    }
  })

  let fetchCalls = 0
  const formEntries = []
  globalThis.fetch = async (_url, options) => {
    for (const [name, value] of options.body.entries()) {
      formEntries.push([name, typeof value === 'string' ? value : value.name])
    }
    fetchCalls += 1
    if (fetchCalls === 1) {
      return {
        ok: true,
        async json() {
          return {
            text: 'Hello team',
            language: 'en',
            duration: 4,
            segments: [
              { start: 0, end: 2, text: 'Hello team' }
            ]
          }
        }
      }
    }

    return {
      ok: true,
      async json() {
        return {
          text: 'I am on it',
          language: 'en',
          duration: 3,
          segments: [
            { start: 0, end: 2, text: 'I am on it' }
          ]
        }
      }
    }
  }

  const processed = await processPendingMeetingTranscripts(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.completeness, 'partial')
  assert.equal(db.tables.meeting_artifacts[0].payload.language, 'fr')
  assert.equal(db.tables.meeting_artifacts[0].payload.detected_language, 'en')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments.length, 2)
  assert.deepEqual(db.tables.meeting_artifacts[0].payload.filter_summary, {
    raw_segment_count: 2,
    kept_segment_count: 2,
    dropped_no_speech_count: 0,
    dropped_compression_count: 0,
    dropped_boilerplate_count: 0
  })
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].speaker_user_id, 'user-1')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[1].speaker_user_id, 'user-2')
  assert.match(db.tables.meeting_artifacts[0].payload.text, /Alex: Hello team/)
  assert.match(db.tables.meeting_artifacts[0].payload.text, /Sam: I am on it/)
  assert.equal(db.tables.meeting_artifacts[0].payload.warnings.length, 2)
  assert.equal(db.tables.meeting_artifacts[0].payload.warnings[1].code, 'recording_paused')
  assert.equal(db.tables.meeting_artifacts[0].payload.warnings[1].start_ms, 10000)
  assert.equal(db.tables.meeting_artifacts[0].payload.warnings[1].end_ms, 20000)
  assert.equal(db.tables.meeting_recordings[0].status, 'completed')
  assert.equal(db.tables.meeting_recordings[1].status, 'completed')
  assert.ok(formEntries.some(([name, value]) => name === 'language' && value === 'fr'))
  assert.equal(searchUpdates.length, 1)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-updated',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      artifactTypes: ['transcript']
    }
  }])
})

test('processPendingMeetingTranscripts supports text-only OpenAI transcription models', async () => {
  const { app, db } = createApp({
    seed: {
      ai_function_configs: [{
        function_key: 'transcription',
        enabled: true,
        provider_instance_id: 'instance-1',
        model: 'gpt-4o-transcribe',
        updated_at: '2026-03-24T10:00:00.000Z'
      }],
      meetings: [{
        id: 'meeting-text-only',
        title: 'Async Sync',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:05:00.000Z',
        updated_at: '2026-03-24T10:05:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_recordings: [{
        id: 'recording-text-only',
        meeting_id: 'meeting-text-only',
        user_id: 'user-1',
        participant_identity: 'user-1',
        participant_display_name: 'Alex',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-text-only/user-1/recording-text-only.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 4000,
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:00:04.000Z',
        created_at: '2026-03-24T10:00:00.000Z',
        updated_at: '2026-03-24T10:05:10.000Z'
      }],
      meeting_artifacts: [{
        id: 'artifact-text-only',
        meeting_id: 'meeting-text-only',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: '2026-03-24T10:05:00.000Z',
        updated_at: '2026-03-24T10:05:00.000Z'
      }]
    }
  })

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        text: 'Hello from GPT-4o',
        language: 'en'
      }
    }
  })

  const processed = await processPendingMeetingTranscripts(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.completeness, 'complete')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments.length, 1)
  assert.deepEqual(db.tables.meeting_artifacts[0].payload.filter_summary, {
    raw_segment_count: 0,
    kept_segment_count: 1,
    dropped_no_speech_count: 0,
    dropped_compression_count: 0,
    dropped_boilerplate_count: 0
  })
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].speaker_user_id, 'user-1')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].start_ms, 0)
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].end_ms, 4000)
  assert.match(db.tables.meeting_artifacts[0].payload.text, /Alex: Hello from GPT-4o/)
})

test('processPendingMeetingTranscripts reconstructs recording start from ended_at and duration when started_at is missing', async () => {
  const { app, db } = createApp({
    seed: {
      meetings: [{
        id: 'meeting-derived-start',
        title: 'Ordered Sync',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:01:00.000Z',
        updated_at: '2026-03-24T10:01:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_recordings: [{
        id: 'recording-admin',
        meeting_id: 'meeting-derived-start',
        user_id: 'user-1',
        participant_identity: 'user-1',
        participant_display_name: 'Admin',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-derived-start/user-1/recording-admin.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 4000,
        started_at: null,
        ended_at: '2026-03-24T10:00:05.000Z',
        created_at: '2026-03-24T10:00:00.500Z',
        updated_at: '2026-03-24T10:01:10.000Z'
      }, {
        id: 'recording-aze',
        meeting_id: 'meeting-derived-start',
        user_id: 'user-2',
        participant_identity: 'user-2',
        participant_display_name: 'aze',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-derived-start/user-2/recording-aze.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 4000,
        started_at: null,
        ended_at: '2026-03-24T10:00:08.000Z',
        created_at: '2026-03-24T10:00:03.500Z',
        updated_at: '2026-03-24T10:01:10.000Z'
      }],
      meeting_artifacts: [{
        id: 'artifact-derived-start',
        meeting_id: 'meeting-derived-start',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: '2026-03-24T10:01:00.000Z',
        updated_at: '2026-03-24T10:01:00.000Z'
      }]
    }
  })

  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    if (fetchCalls === 1) {
      return {
        ok: true,
        async json() {
          return {
            text: 'This is the first sentence',
            language: 'en',
            segments: [
              { start: 0, end: 1, text: 'This is the first sentence' }
            ]
          }
        }
      }
    }

    return {
      ok: true,
      async json() {
        return {
          text: 'This is the second sentence',
          language: 'en',
          segments: [
            { start: 0, end: 1, text: 'This is the second sentence' }
          ]
        }
      }
    }
  }

  const processed = await processPendingMeetingTranscripts(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].speaker_label, 'Admin')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[1].speaker_label, 'aze')
})

test('processPendingMeetingTranscripts drops whisper hallucination segments via signal gating and boilerplate safety net', async () => {
  const { app, db } = createApp({
    seed: {
      meetings: [{
        id: 'meeting-whisper-hardening',
        title: 'Weekly Sync',
        language: 'de',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:05:00.000Z',
        updated_at: '2026-03-24T10:05:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_recordings: [{
        id: 'recording-whisper-hardening',
        meeting_id: 'meeting-whisper-hardening',
        user_id: 'user-1',
        participant_identity: 'user-1',
        participant_display_name: 'Alex',
        status: 'ready',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-whisper-hardening/user-1/recording-whisper-hardening.mp4',
        mime_type: 'audio/mp4',
        duration_ms: 5000,
        started_at: '2026-03-24T10:00:00.000Z',
        ended_at: '2026-03-24T10:00:05.000Z',
        created_at: '2026-03-24T10:00:00.000Z',
        updated_at: '2026-03-24T10:05:10.000Z'
      }],
      meeting_artifacts: [{
        id: 'artifact-whisper-hardening',
        meeting_id: 'meeting-whisper-hardening',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: '2026-03-24T10:05:00.000Z',
        updated_at: '2026-03-24T10:05:00.000Z'
      }]
    }
  })

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        text: 'Bis zum naechsten Mal, haut rein!',
        language: 'de',
        segments: [
          {
            start: 0,
            end: 1,
            text: 'Bis zum naechsten Mal, haut rein!',
            avg_logprob: -0.2,
            no_speech_prob: 0.05,
            compression_ratio: 1.1
          },
          {
            start: 1,
            end: 2,
            text: 'Untertitel im Auftrag des ZDF fuer funk, 2017',
            avg_logprob: -0.3,
            no_speech_prob: 0.08,
            compression_ratio: 1.2
          },
          {
            start: 2,
            end: 3,
            text: 'Rauschen',
            avg_logprob: -1.3,
            no_speech_prob: 0.92,
            compression_ratio: 1.3
          },
          {
            start: 3,
            end: 4,
            text: 'Wiederholter Halluzinationsblock',
            avg_logprob: -1.4,
            no_speech_prob: 0.12,
            compression_ratio: 2.9
          }
        ]
      }
    }
  })

  const processed = await processPendingMeetingTranscripts(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.segments.length, 1)
  assert.equal(db.tables.meeting_artifacts[0].payload.segments[0].text, 'Bis zum naechsten Mal, haut rein!')
  assert.deepEqual(db.tables.meeting_artifacts[0].payload.filter_summary, {
    raw_segment_count: 4,
    kept_segment_count: 1,
    dropped_no_speech_count: 1,
    dropped_compression_count: 1,
    dropped_boilerplate_count: 1
  })
  assert.equal(db.tables.meeting_artifacts[0].payload.text, 'Alex: Bis zum naechsten Mal, haut rein!')
})

test('processPendingMeetingTranscripts fails timed-out meetings with no successful recordings', async () => {
  const { app, db, emitted } = createApp({
    seed: {
      meetings: [{
        id: 'meeting-timeout',
        status: 'ended',
        source_channel_id: null,
        chat_channel_id: 'chat-timeout',
        started_at: '2026-03-24T09:00:00.000Z',
        ended_at: '2026-03-24T09:01:00.000Z',
        updated_at: '2026-03-24T09:01:00.000Z'
      }],
      meeting_recordings: [{
        id: 'recording-timeout',
        meeting_id: 'meeting-timeout',
        user_id: 'user-1',
        participant_identity: 'user-1',
        participant_display_name: 'Alex',
        status: 'ending',
        storage_bucket: 'bucket-1',
        storage_key: 'meeting-recordings/meeting-timeout/user-1/recording-timeout.mp4',
        mime_type: 'audio/mp4',
        duration_ms: null,
        started_at: '2026-03-24T09:00:00.000Z',
        ended_at: null,
        created_at: '2026-03-24T09:00:00.000Z',
        updated_at: '2026-03-24T09:01:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'artifact-timeout',
        meeting_id: 'meeting-timeout',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: '2026-03-24T09:01:00.000Z',
        updated_at: '2026-03-24T09:01:00.000Z'
      }]
    }
  })

  globalThis.fetch = async () => {
    throw new Error('fetch should not be called for failed-only transcripts')
  }

  const processed = await processPendingMeetingTranscripts(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_recordings[0].status, 'failed')
  assert.equal(db.tables.meeting_recordings[0].failure_code, 'recording_timeout')
  assert.equal(db.tables.meeting_artifacts[0].status, 'failed')
  assert.equal(db.tables.meeting_artifacts[0].payload.warnings.length, 1)
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-updated',
    payload: {
      meetingId: 'meeting-timeout',
      chatChannelId: 'chat-timeout',
      artifactTypes: ['transcript']
    }
  }])
})

test('mergeSpeakerTranscriptSegments removes repeated overlap segments', () => {
  const merged = mergeSpeakerTranscriptSegments([
    {
      speaker_user_id: 'user-1',
      speaker_label: 'Alex',
      start_ms: 0,
      end_ms: 1500,
      text: 'Hello team'
    },
    {
      speaker_user_id: 'user-1',
      speaker_label: 'Alex',
      start_ms: 1200,
      end_ms: 2600,
      text: 'Hello team'
    }
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].end_ms, 2600)
})

test('resolveWhisperSegmentDropReason applies whisper-signal thresholds conservatively', () => {
  assert.equal(resolveWhisperSegmentDropReason({
    text: 'Rauschen',
    avg_logprob: -1.1,
    no_speech_prob: 0.8
  }, {
    noSpeechDropThreshold: 0.6,
    minAvgLogprob: -1.0,
    maxCompressionRatio: 2.4,
    subtitleSafetyNetEnabled: true
  }), 'no_speech')

  assert.equal(resolveWhisperSegmentDropReason({
    text: 'Repeat repeat repeat',
    avg_logprob: -1.2,
    compression_ratio: 2.7
  }, {
    noSpeechDropThreshold: 0.6,
    minAvgLogprob: -1.0,
    maxCompressionRatio: 2.4,
    subtitleSafetyNetEnabled: true
  }), 'compression')

  assert.equal(resolveWhisperSegmentDropReason({
    text: 'Wir sprechen heute ueber Untertitel und Barrierefreiheit.',
    avg_logprob: -0.2,
    no_speech_prob: 0.1,
    compression_ratio: 1.1
  }, {
    noSpeechDropThreshold: 0.6,
    minAvgLogprob: -1.0,
    maxCompressionRatio: 2.4,
    subtitleSafetyNetEnabled: true
  }), null)
})

test('isLikelySubtitleCreditHallucination matches subtitle-credit boilerplate only', () => {
  assert.equal(isLikelySubtitleCreditHallucination('Untertitel der Amara.org-Community'), true)
  assert.equal(isLikelySubtitleCreditHallucination('Untertitel im Auftrag des ZDF fuer funk, 2017'), true)
  assert.equal(isLikelySubtitleCreditHallucination('Untertitel von Stephanie Geiges'), true)
  assert.equal(isLikelySubtitleCreditHallucination('Wir sprechen heute ueber Untertitel und Barrierefreiheit.'), false)
})
