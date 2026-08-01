import test from 'node:test'
import assert from 'node:assert/strict'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { MeetingQuestionsService } from '../src/services/meeting-questions/meeting-questions.js'
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

function createService({ seed, draft } = {}) {
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

  let lastGenerateArgs = null
  const service = new MeetingQuestionsService({
    Model: db,
    app: {
      get(name) {
        if (name === 'generateStructuredObject') {
          return async (args) => {
            lastGenerateArgs = args
            return args.validateObject(draft || {
              answer: 'Der Rollout bleibt fuer Freitag geplant.',
              language: 'de',
              evidence_ids: ['transcript:1', 'chat:message-1']
            })
          }
        }
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  return {
    service,
    db,
    getLastGenerateArgs() {
      return lastGenerateArgs
    }
  }
}

test('meeting-questions create stores private question history with citations', async () => {
  const { service, db } = createService({
    seed: {
      meetings: [{
        id: 'meeting-1',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1',
        started_at: '2026-03-26T09:00:00.000Z',
        ended_at: '2026-03-26T09:30:00.000Z'
      }],
      meeting_participants: [{
        id: 'participant-1',
        meeting_id: 'meeting-1',
        user_id: 'user-1',
        role: 'host',
        invite_status: 'left'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      users: [{
        id: 'user-1',
        display_name: 'Alex'
      }],
      messages: [{
        id: 'message-1',
        channel_id: 'chat-1',
        user_id: 'user-1',
        type: 'text',
        content: 'Rollout bleibt fuer Freitag geplant.',
        deleted_at: null,
        created_at: '2026-03-26T09:10:00.000Z'
      }],
      meeting_artifacts: [{
        id: 'summary-artifact-1',
        meeting_id: 'meeting-1',
        artifact_type: 'summary',
        status: 'ready',
        payload: {
          mini_summary: 'Rollout ist auf Kurs.',
          summary_points: ['Freitag bleibt das Ziel.']
        }
      }, {
        id: 'transcript-artifact-1',
        meeting_id: 'meeting-1',
        artifact_type: 'transcript',
        status: 'ready',
        payload: {
          text: 'Alex: Freitag bleibt das Ziel.',
          segments: [{
            speaker_label: 'Alex',
            start_ms: 1000,
            end_ms: 3000,
            text: 'Freitag bleibt das Ziel.'
          }]
        }
      }]
    }
  })

  const created = await service.create({
    meeting_id: 'meeting-1',
    question: 'Wann ist der Rollout?'
  }, {
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(created.meeting_id, 'meeting-1')
  assert.equal(created.user_id, 'user-1')
  assert.equal(created.citations.length, 2)
  assert.equal(db.tables.meeting_questions.length, 1)
  assert.equal(typeof db.tables.meeting_questions[0].citations, 'string')

  const history = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: { meeting_id: 'meeting-1' }
  })

  assert.equal(history.data.length, 1)
  assert.equal(history.data[0].question, 'Wann ist der Rollout?')
  assert.equal(history.data[0].citations.length, 2)
})

test('meeting-questions create rejects active meetings', async () => {
  const { service } = createService({
    seed: {
      meetings: [{
        id: 'meeting-active',
        status: 'active',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1'
      }],
      meeting_participants: [{
        id: 'participant-1',
        meeting_id: 'meeting-active',
        user_id: 'user-1',
        role: 'host',
        invite_status: 'joined'
      }]
    }
  })

  await assert.rejects(
    service.create({
      meeting_id: 'meeting-active',
      question: 'Kann ich das schon fragen?'
    }, {
      user: { id: 'user-1', is_admin: false }
    }),
    BadRequest
  )
})

test('meeting-questions create includes transcript context beyond the former segment and excerpt caps', async () => {
  const longSegments = Array.from({ length: 220 }, (_, index) => ({
    speaker_label: 'Alex',
    start_ms: index * 1000,
    end_ms: (index * 1000) + 900,
    text: `Question segment ${index + 1} marker ${String(index + 1).padStart(3, '0')} ${'detail '.repeat(12).trim()}`
  }))

  const { service, getLastGenerateArgs } = createService({
    draft: {
      answer: 'Spaetere Meeting-Kontextstellen wurden beruecksichtigt.',
      language: 'de',
      evidence_ids: ['transcript:220']
    },
    seed: {
      meetings: [{
        id: 'meeting-long-question-context',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-long-question-context',
        started_at: '2026-03-26T11:00:00.000Z',
        ended_at: '2026-03-26T12:00:00.000Z'
      }],
      meeting_participants: [{
        id: 'participant-1',
        meeting_id: 'meeting-long-question-context',
        user_id: 'user-1',
        role: 'host',
        invite_status: 'left'
      }],
      channels: [{
        id: 'source-1',
        name: 'ops'
      }],
      meeting_artifacts: [{
        id: 'transcript-artifact-long-question-context',
        meeting_id: 'meeting-long-question-context',
        artifact_type: 'transcript',
        status: 'ready',
        payload: {
          text: longSegments.map((segment) => `${segment.speaker_label}: ${segment.text}`).join('\n'),
          segments: longSegments
        }
      }]
    }
  })

  const created = await service.create({
    meeting_id: 'meeting-long-question-context',
    question: 'Was kam spaeter im Meeting zur Sprache?'
  }, {
    user: { id: 'user-1', is_admin: false }
  })

  const prompt = JSON.parse(getLastGenerateArgs().userPrompt)

  assert.equal(created.citations[0].snippet.includes('marker 220'), true)
  assert.equal(prompt.context.transcript.segments.length, 220)
  assert.equal(prompt.context.transcript.segments.at(-1).text, longSegments.at(-1).text)
  assert.match(prompt.context.transcript.text_excerpt, /marker 180/)
})

test('meeting-questions create respects env overrides for shared prompt caps', async () => {
  await withEnv({
    MEETING_AI_PROMPT_TRANSCRIPT_SEGMENTS: '190',
    MEETING_AI_PROMPT_CHAT_MESSAGES: '180',
    MEETING_AI_PROMPT_TRANSCRIPT_EXCERPT_CHARS: '15000'
  }, async () => {
    const longSegments = Array.from({ length: 220 }, (_, index) => ({
      speaker_label: 'Alex',
      start_ms: index * 1000,
      end_ms: (index * 1000) + 900,
      text: `Override question segment ${index + 1} marker ${String(index + 1).padStart(3, '0')} ${'detail '.repeat(12).trim()}`
    }))

    const { service, getLastGenerateArgs } = createService({
      draft: {
        answer: 'Env override applied.',
        language: 'de',
        evidence_ids: ['transcript:190']
      },
      seed: {
        meetings: [{
          id: 'meeting-env-question-context',
          status: 'ended',
          source_channel_id: 'source-1',
          chat_channel_id: 'chat-env-question-context',
          started_at: '2026-03-26T12:30:00.000Z',
          ended_at: '2026-03-26T13:30:00.000Z'
        }],
        meeting_participants: [{
          id: 'participant-1',
          meeting_id: 'meeting-env-question-context',
          user_id: 'user-1',
          role: 'host',
          invite_status: 'left'
        }],
        channels: [{
          id: 'source-1',
          name: 'ops'
        }],
        meeting_artifacts: [{
          id: 'transcript-artifact-env-question-context',
          meeting_id: 'meeting-env-question-context',
          artifact_type: 'transcript',
          status: 'ready',
          payload: {
            text: longSegments.map((segment) => `${segment.speaker_label}: ${segment.text}`).join('\n'),
            segments: longSegments
          }
        }]
      }
    })

    const created = await service.create({
      meeting_id: 'meeting-env-question-context',
      question: 'Welche spaeteren Punkte sind relevant?'
    }, {
      user: { id: 'user-1', is_admin: false }
    })

    const prompt = JSON.parse(getLastGenerateArgs().userPrompt)

    assert.equal(created.citations[0].snippet.includes('marker 190'), true)
    assert.equal(prompt.context.transcript.segments.length, 190)
    assert.equal(prompt.context.transcript.segments.at(-1).text, longSegments[189].text)
    assert.match(prompt.context.transcript.text_excerpt, /marker 112/)
    assert.equal(prompt.context.transcript.text_excerpt.length, 15000)
  })
})

test('meeting-questions find is owner-scoped through meeting membership and user id', async () => {
  const { service, db } = createService({
    seed: {
      meetings: [{
        id: 'meeting-private',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1'
      }],
      meeting_participants: [{
        id: 'participant-1',
        meeting_id: 'meeting-private',
        user_id: 'user-1',
        role: 'host',
        invite_status: 'left'
      }],
      meeting_questions: [{
        id: 'question-1',
        meeting_id: 'meeting-private',
        user_id: 'user-1',
        question: 'Meine Frage',
        answer: 'Meine Antwort',
        language: 'de',
        citations: [],
        created_at: '2026-03-26T10:00:00.000Z',
        updated_at: '2026-03-26T10:00:00.000Z'
      }, {
        id: 'question-2',
        meeting_id: 'meeting-private',
        user_id: 'user-2',
        question: 'Fremde Frage',
        answer: 'Fremde Antwort',
        language: 'de',
        citations: [],
        created_at: '2026-03-26T10:01:00.000Z',
        updated_at: '2026-03-26T10:01:00.000Z'
      }]
    }
  })

  const history = await service.find({
    user: { id: 'user-1', is_admin: false },
    query: { meeting_id: 'meeting-private' }
  })

  assert.equal(history.data.length, 1)
  assert.equal(history.data[0].id, 'question-1')
  assert.equal(db.tables.meeting_questions.length, 2)
})

test('meeting-questions rejects users outside the meeting membership boundary', async () => {
  const { service } = createService({
    seed: {
      meetings: [{
        id: 'meeting-forbidden',
        status: 'ended',
        source_channel_id: 'source-1',
        chat_channel_id: 'chat-1'
      }],
      meeting_participants: []
    }
  })

  await assert.rejects(
    service.find({
      user: { id: 'user-3', is_admin: false },
      query: { meeting_id: 'meeting-forbidden' }
    }),
    Forbidden
  )
})
