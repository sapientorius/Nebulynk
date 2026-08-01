import test from 'node:test'
import assert from 'node:assert/strict'
import { processPendingMeetingSummaries } from '../src/services/meetings/summary-processor.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function withEnv(patch, run) {
  const previous = {}

  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value == null) {
      delete process.env[key]
    } else {
      process.env[key] = String(value)
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    })
}

function createApp({ seed, draft } = {}) {
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'meeting_summary',
      enabled: true,
      provider_instance_id: 'instance-1',
      model: 'gpt-4.1-mini',
      updated_at: '2026-03-26T09:00:00.000Z'
    }],
    ai_provider_instances: [{
      id: 'instance-1',
      provider_type: 'openai',
      display_name: 'OpenAI',
      enabled: true,
      base_url: 'https://api.openai.com/v1',
      created_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T09:00:00.000Z'
    }],
    ai_provider_secrets: [{
      provider_instance_id: 'instance-1',
      encrypted_secret: encryptSecret({
        get(name) {
          if (name === 'authentication') return { secret: 'test-auth-secret' }
          return null
        }
      }, 'secret-key'),
      created_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T09:00:00.000Z'
    }],
    ...seed
  })

  const emitted = []
  const searchUpdates = []
  let lastGenerateArgs = null

  for (const meeting of db.tables.meetings) {
    if (!meeting.language) {
      meeting.language = 'de'
    }
  }

  return {
    db,
    emitted,
    searchUpdates,
    getLastGenerateArgs() {
      return lastGenerateArgs
    },
    app: {
      get(name) {
        if (name === 'postgresqlClient') return db
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        if (name === 'generateStructuredObject') {
          return async (args) => {
            lastGenerateArgs = args
            return args.validateObject(draft)
          }
        }
        if (name === 'upsertMeetingArtifactSearchDocument') {
          return async (database, artifactId) => {
            searchUpdates.push(artifactId)
            database.tables.search_documents.push({
              id: `meeting_summary:${artifactId}`,
              document_id: artifactId
            })
          }
        }
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

test('processPendingMeetingSummaries builds structured summary payload from transcript and chat', async () => {
  const { app, db, emitted, searchUpdates, getLastGenerateArgs } = createApp({
    draft: {
      language: 'de',
      mini_summary: 'Kurze Zusammenfassung',
      summary_points: ['Projektstatus ist auf Kurs', 'Rollout bleibt fuer Freitag geplant'],
      decisions: [{
        text: 'Das Team shippt am Freitag.',
        evidence_ids: ['transcript:1', 'chat:message-1']
      }],
      open_items: [{
        kind: 'risk',
        text: 'Die Monitoring-Abdeckung ist noch unvollstaendig.',
        evidence_ids: ['chat:message-2']
      }],
      topic_chapters: [{
        title: 'Rollout',
        summary: 'Release-Freigabe und Restarbeiten wurden abgestimmt.',
        evidence_ids: ['transcript:1']
      }]
    },
    seed: {
      meetings: [{
        id: 'meeting-1',
        title: 'Weekly Sync',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-26T09:00:00.000Z',
        ended_at: '2026-03-26T09:30:00.000Z',
        updated_at: '2026-03-26T09:30:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      users: [{
        id: 'user-1',
        display_name: 'Alex'
      }, {
        id: 'user-2',
        display_name: 'Sam'
      }],
      messages: [{
        id: 'message-1',
        channel_id: 'chat-1',
        user_id: 'user-1',
        type: 'text',
        content: 'Release ist fuer Freitag vorgesehen.',
        deleted_at: null,
        created_at: '2026-03-26T09:10:00.000Z'
      }, {
        id: 'message-2',
        channel_id: 'chat-1',
        user_id: 'user-2',
        type: 'text',
        content: 'Monitoring fuer den neuen Worker fehlt noch.',
        deleted_at: null,
        created_at: '2026-03-26T09:12:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-1',
        meeting_id: 'meeting-1',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T09:30:00.000Z',
        updated_at: '2026-03-26T09:30:00.000Z'
      }, {
        id: 'transcript-artifact-1',
        meeting_id: 'meeting-1',
        artifact_type: 'transcript',
        status: 'ready',
        payload: {
          language: 'de',
          completeness: 'complete',
          warnings: [],
          text: 'Alex: Wir shippen am Freitag.',
          segments: [{
            speaker_label: 'Alex',
            speaker_user_id: 'user-1',
            start_ms: 1000,
            end_ms: 3000,
            text: 'Wir shippen am Freitag.'
          }]
        },
        created_at: '2026-03-26T09:30:00.000Z',
        updated_at: '2026-03-26T09:31:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.language, 'de')
  assert.equal(db.tables.meeting_artifacts[0].payload.mini_summary, 'Kurze Zusammenfassung')
  assert.equal(db.tables.meeting_artifacts[0].payload.coverage.chat_message_count, 2)
  assert.equal(db.tables.meeting_artifacts[0].payload.decisions[0].evidence[0].type, 'transcript')
  assert.equal(db.tables.meeting_artifacts[0].payload.decisions[0].evidence[1].type, 'chat')
  assert.match(db.tables.meeting_artifacts[0].payload.markdown, /## Decisions/)
  assert.match(getLastGenerateArgs().userPrompt, /"target_language": "de"/)
  assert.deepEqual(searchUpdates, ['summary-artifact-1'])
  assert.deepEqual(emitted, [{
    eventName: 'artifacts-updated',
    payload: {
      meetingId: 'meeting-1',
      chatChannelId: 'chat-1',
      artifactTypes: ['summary']
    }
  }])
})

test('processPendingMeetingSummaries includes transcript context beyond the former segment and excerpt caps', async () => {
  const longSegments = Array.from({ length: 200 }, (_, index) => ({
    speaker_label: 'Alex',
    speaker_user_id: 'user-1',
    start_ms: index * 1000,
    end_ms: (index * 1000) + 900,
    text: `Segment ${index + 1} marker ${String(index + 1).padStart(3, '0')} ${'detail '.repeat(12).trim()}`
  }))

  const { app, getLastGenerateArgs } = createApp({
    draft: {
      language: 'de',
      mini_summary: 'Long summary',
      summary_points: ['Long context was used.'],
      decisions: [],
      open_items: [],
      topic_chapters: []
    },
    seed: {
      meetings: [{
        id: 'meeting-long-context',
        title: 'Long Context Meeting',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-long-context',
        started_at: '2026-03-26T15:00:00.000Z',
        ended_at: '2026-03-26T16:00:00.000Z',
        updated_at: '2026-03-26T16:00:00.000Z'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-long-context',
        meeting_id: 'meeting-long-context',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T16:00:00.000Z',
        updated_at: '2026-03-26T16:00:00.000Z'
      }, {
        id: 'transcript-artifact-long-context',
        meeting_id: 'meeting-long-context',
        artifact_type: 'transcript',
        status: 'ready',
        payload: {
          language: 'de',
          completeness: 'complete',
          warnings: [],
          text: longSegments.map((segment) => `${segment.speaker_label}: ${segment.text}`).join('\n'),
          segments: longSegments
        },
        created_at: '2026-03-26T16:00:00.000Z',
        updated_at: '2026-03-26T16:01:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)
  const prompt = JSON.parse(getLastGenerateArgs().userPrompt)

  assert.equal(processed, 1)
  assert.equal(prompt.context.transcript.segments.length, 200)
  assert.equal(prompt.context.transcript.segments.at(-1).text, longSegments.at(-1).text)
  assert.match(prompt.context.transcript.text_excerpt, /marker 180/)
})

test('processPendingMeetingSummaries respects env overrides for shared prompt caps', async () => {
  await withEnv({
    MEETING_AI_PROMPT_TRANSCRIPT_SEGMENTS: '180',
    MEETING_AI_PROMPT_CHAT_MESSAGES: '180',
    MEETING_AI_PROMPT_TRANSCRIPT_EXCERPT_CHARS: '15000'
  }, async () => {
    const longSegments = Array.from({ length: 220 }, (_, index) => ({
      speaker_label: 'Alex',
      speaker_user_id: 'user-1',
      start_ms: index * 1000,
      end_ms: (index * 1000) + 900,
      text: `Override summary segment ${index + 1} marker ${String(index + 1).padStart(3, '0')} ${'detail '.repeat(12).trim()}`
    }))

    const { app, getLastGenerateArgs } = createApp({
      draft: {
        language: 'de',
        mini_summary: 'Env override summary',
        summary_points: ['Env override applied.'],
        decisions: [],
        open_items: [],
        topic_chapters: []
      },
      seed: {
        meetings: [{
          id: 'meeting-env-summary-context',
          title: 'Env Summary Context',
          status: 'ended',
          source_channel_id: 'source-1',
          chat_channel_id: 'chat-env-summary-context',
          started_at: '2026-03-26T17:00:00.000Z',
          ended_at: '2026-03-26T18:00:00.000Z',
          updated_at: '2026-03-26T18:00:00.000Z'
        }],
        channels: [{
          id: 'source-1',
          name: 'ops'
        }],
        meeting_artifacts: [{
          id: 'summary-artifact-env-summary-context',
          meeting_id: 'meeting-env-summary-context',
          artifact_type: 'summary',
          status: 'processing',
          payload: null,
          created_at: '2026-03-26T18:00:00.000Z',
          updated_at: '2026-03-26T18:00:00.000Z'
        }, {
          id: 'transcript-artifact-env-summary-context',
          meeting_id: 'meeting-env-summary-context',
          artifact_type: 'transcript',
          status: 'ready',
          payload: {
            language: 'de',
            completeness: 'complete',
            warnings: [],
            text: longSegments.map((segment) => `${segment.speaker_label}: ${segment.text}`).join('\n'),
            segments: longSegments
          },
          created_at: '2026-03-26T18:00:00.000Z',
          updated_at: '2026-03-26T18:01:00.000Z'
        }]
      }
    })

    const processed = await processPendingMeetingSummaries(app)
    const prompt = JSON.parse(getLastGenerateArgs().userPrompt)

    assert.equal(processed, 1)
    assert.equal(prompt.context.transcript.segments.length, 180)
    assert.equal(prompt.context.transcript.segments.at(-1).text, longSegments[179].text)
    assert.match(prompt.context.transcript.text_excerpt, /marker 114/)
    assert.equal(prompt.context.transcript.text_excerpt.length, 15000)
  })
})

test('processPendingMeetingSummaries waits while transcript is still processing even after the former timeout window', async () => {
  const oldIso = '2026-03-26T09:30:00.000Z'
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Should not be used',
      summary_points: []
    },
    seed: {
      meetings: [{
        id: 'meeting-2',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-2',
        started_at: oldIso,
        ended_at: oldIso,
        updated_at: oldIso
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      meeting_artifacts: [{
        id: 'summary-artifact-2',
        meeting_id: 'meeting-2',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: oldIso,
        updated_at: oldIso
      }, {
        id: 'transcript-artifact-2',
        meeting_id: 'meeting-2',
        artifact_type: 'transcript',
        status: 'processing',
        payload: null,
        created_at: oldIso,
        updated_at: oldIso
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 0)
  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
})

test('processPendingMeetingSummaries waits while transcript is still pending', async () => {
  const oldIso = '2026-03-26T09:30:00.000Z'
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Should not be used',
      summary_points: []
    },
    seed: {
      meetings: [{
        id: 'meeting-pending-transcript',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-pending-transcript',
        started_at: oldIso,
        ended_at: oldIso,
        updated_at: oldIso
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      meeting_artifacts: [{
        id: 'summary-artifact-pending-transcript',
        meeting_id: 'meeting-pending-transcript',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: oldIso,
        updated_at: oldIso
      }, {
        id: 'transcript-artifact-pending-transcript',
        meeting_id: 'meeting-pending-transcript',
        artifact_type: 'transcript',
        status: 'pending',
        payload: null,
        created_at: oldIso,
        updated_at: oldIso
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 0)
  assert.equal(db.tables.meeting_artifacts[0].status, 'processing')
})

test('processPendingMeetingSummaries degrades gracefully when transcript failed but chat exists', async () => {
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Chat-only summary',
      summary_points: ['Nur der Chat war verwertbar.'],
      decisions: [],
      open_items: [],
      topic_chapters: []
    },
    seed: {
      meetings: [{
        id: 'meeting-3',
        title: 'Incident Review',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-3',
        started_at: '2026-03-26T11:00:00.000Z',
        ended_at: '2026-03-26T11:20:00.000Z',
        updated_at: '2026-03-26T11:20:00.000Z'
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      users: [{ id: 'user-1', display_name: 'Alex' }],
      messages: [{
        id: 'message-3',
        channel_id: 'chat-3',
        user_id: 'user-1',
        type: 'text',
        content: 'Follow-up kommt morgen.',
        deleted_at: null,
        created_at: '2026-03-26T11:10:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-3',
        meeting_id: 'meeting-3',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T11:20:00.000Z',
        updated_at: '2026-03-26T11:20:00.000Z'
      }, {
        id: 'transcript-artifact-3',
        meeting_id: 'meeting-3',
        artifact_type: 'transcript',
        status: 'failed',
        payload: {
          warnings: [{ code: 'recording_failed' }]
        },
        created_at: '2026-03-26T11:20:00.000Z',
        updated_at: '2026-03-26T11:21:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.deepEqual(db.tables.meeting_artifacts[0].payload.coverage.basis, ['chat'])
  assert.equal(db.tables.meeting_artifacts[0].payload.coverage.transcript_status, 'failed')
})

test('processPendingMeetingSummaries counts non-system meeting messages with content in coverage', async () => {
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Coverage summary',
      summary_points: ['Chat messages were included.'],
      decisions: [],
      open_items: [],
      topic_chapters: []
    },
    seed: {
      meetings: [{
        id: 'meeting-coverage-1',
        title: 'Coverage Check',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-coverage-1',
        started_at: '2026-03-26T13:00:00.000Z',
        ended_at: '2026-03-26T13:30:00.000Z',
        updated_at: '2026-03-26T13:30:00.000Z'
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      users: [{
        id: 'user-1',
        display_name: 'Alex'
      }, {
        id: 'user-2',
        display_name: 'Sam'
      }],
      messages: [{
        id: 'message-coverage-1',
        channel_id: 'chat-coverage-1',
        user_id: 'user-1',
        type: 'file',
        content: 'Hier ist noch der Log-Auszug.',
        deleted_at: null,
        created_at: '2026-03-26T13:05:00.000Z'
      }, {
        id: 'message-coverage-2',
        channel_id: 'chat-coverage-1',
        user_id: 'user-2',
        type: null,
        content: 'Ich habe das Verhalten ebenfalls gesehen.',
        deleted_at: null,
        created_at: '2026-03-26T13:06:00.000Z'
      }, {
        id: 'message-coverage-3',
        channel_id: 'chat-coverage-1',
        user_id: 'user-2',
        type: 'system',
        content: 'System message should not count.',
        deleted_at: null,
        created_at: '2026-03-26T13:07:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-coverage-1',
        meeting_id: 'meeting-coverage-1',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T13:30:00.000Z',
        updated_at: '2026-03-26T13:30:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.coverage.chat_message_count, 2)
  assert.equal(db.tables.meeting_artifacts[0].payload.coverage.chat_author_count, 2)
})

test('processPendingMeetingSummaries fails when neither transcript nor chat is available', async () => {
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Unused',
      summary_points: []
    },
    seed: {
      meetings: [{
        id: 'meeting-4',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-4',
        started_at: '2026-03-26T12:00:00.000Z',
        ended_at: '2026-03-26T12:05:00.000Z',
        updated_at: '2026-03-26T12:05:00.000Z'
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      meeting_artifacts: [{
        id: 'summary-artifact-4',
        meeting_id: 'meeting-4',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T12:05:00.000Z',
        updated_at: '2026-03-26T12:05:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'failed')
  assert.match(db.tables.meeting_artifacts[0].payload.failure_message, /No meeting transcript or chat content/)
})

test('processPendingMeetingSummaries uses the manual summary runtime when auto-summary is disabled', async () => {
  const { app, db } = createApp({
    draft: {
      mini_summary: 'Manual summary still runs',
      summary_points: ['The manual fallback runtime was used.'],
      decisions: [],
      open_items: [],
      topic_chapters: []
    },
    seed: {
      ai_function_configs: [{
        function_key: 'meeting_summary',
        enabled: false,
        provider_instance_id: 'instance-1',
        model: 'gpt-4.1-mini',
        updated_at: '2026-03-26T09:00:00.000Z'
      }],
      meetings: [{
        id: 'meeting-manual-1',
        title: 'Manual Summary',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-manual-1',
        started_at: '2026-03-26T14:00:00.000Z',
        ended_at: '2026-03-26T14:20:00.000Z',
        updated_at: '2026-03-26T14:20:00.000Z'
      }],
      channels: [{ id: 'source-1', name: 'ops' }],
      users: [{ id: 'user-1', display_name: 'Alex' }],
      messages: [{
        id: 'message-manual-1',
        channel_id: 'chat-manual-1',
        user_id: 'user-1',
        type: 'text',
        content: 'Die manuell gestartete Zusammenfassung soll laufen.',
        deleted_at: null,
        created_at: '2026-03-26T14:10:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-manual-1',
        meeting_id: 'meeting-manual-1',
        artifact_type: 'summary',
        status: 'processing',
        payload: null,
        created_at: '2026-03-26T14:20:00.000Z',
        updated_at: '2026-03-26T14:20:00.000Z'
      }]
    }
  })

  const processed = await processPendingMeetingSummaries(app)

  assert.equal(processed, 1)
  assert.equal(db.tables.meeting_artifacts[0].status, 'ready')
  assert.equal(db.tables.meeting_artifacts[0].payload.mini_summary, 'Manual summary still runs')
})
