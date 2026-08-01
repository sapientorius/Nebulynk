import test from 'node:test'
import assert from 'node:assert/strict'
import { Forbidden, NotFound } from '@feathersjs/errors'
import { MessageSummariesService } from '../src/services/message-summaries/message-summaries.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp(db, settings = {}) {
  const emitted = []
  const state = {
    postgresqlClient: db,
    authentication: { secret: 'test-secret' },
    generateStructuredObject: async () => ({
      language: 'de',
      mini_summary: 'Das Projekt bleibt auf Kurs.',
      summary_points: ['Release bleibt geplant.']
    }),
    ...settings
  }

  return {
    emitted,
    get(key) {
      return state[key]
    },
    set(key, value) {
      state[key] = value
    },
    service(name) {
      assert.equal(name, 'message-summaries')
      return {
        emit(eventName, payload) {
          emitted.push({ eventName, payload })
        }
      }
    }
  }
}

function longText(label = 'Text') {
  return `${label} `.repeat(90)
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function baseSeed(app) {
  return {
    users: [
      { id: 'user-1', display_name: 'Ada' },
      { id: 'user-2', display_name: 'Ben' },
      { id: 'user-3', display_name: 'Cid' }
    ],
    channels: [
      { id: 'channel-1', name: 'general', type: 'public', is_archived: false },
      { id: 'channel-2', name: 'private', type: 'private', is_archived: false }
    ],
    channel_members: [
      { id: 'member-1', channel_id: 'channel-1', user_id: 'user-1' },
      { id: 'member-2', channel_id: 'channel-1', user_id: 'user-2' }
    ],
    ai_provider_instances: [
      { id: 'provider-1', provider_type: 'openai', enabled: true, base_url: 'https://api.openai.com/v1' }
    ],
    ai_provider_secrets: [
      { provider_instance_id: 'provider-1', encrypted_secret: encryptSecret(app, 'secret-key') }
    ],
    ai_function_configs: [
      { function_key: 'chat_summary', enabled: true, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
    ],
    messages: [
      {
        id: 'message-1',
        channel_id: 'channel-1',
        user_id: 'user-2',
        content: longText('Launch'),
        type: 'text',
        created_at: '2026-04-17T08:00:00.000Z',
        deleted_at: null
      },
      {
        id: 'message-2',
        channel_id: 'channel-1',
        user_id: 'user-1',
        content: longText('Budget'),
        type: 'text',
        created_at: '2026-04-17T08:05:00.000Z',
        deleted_at: null
      },
      {
        id: 'message-old',
        channel_id: 'channel-1',
        user_id: 'user-1',
        content: longText('Old'),
        type: 'text',
        created_at: '2026-04-15T08:05:00.000Z',
        deleted_at: null
      },
      {
        id: 'system-1',
        channel_id: 'channel-1',
        user_id: 'user-1',
        content: longText('System'),
        type: 'system',
        created_at: '2026-04-17T08:06:00.000Z',
        deleted_at: null
      }
    ]
  }
}

function createService({ seed = {}, settings = {}, now = () => new Date('2026-04-17T09:00:00.000Z') } = {}) {
  const db = createMemoryDb()
  const app = createApp(db, settings)
  Object.assign(db.tables, {
    ...baseSeed(app),
    ...seed
  })
  const service = new MessageSummariesService({
    Model: db,
    app,
    now,
    generateId: () => 'summary-1'
  })
  return { app, db, service }
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('message-summaries creates a private ready artifact for one long message', async () => {
  const { app, db, service } = createService()

  const result = await service.create({
    channel_id: 'channel-1',
    scope: 'message',
    message_id: 'message-1'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(result.status, 'processing')
  await flushAsyncWork()

  const row = db.tables.message_summaries[0]
  assert.equal(row.status, 'ready')
  assert.equal(row.user_id, 'user-1')
  assert.equal(row.summary, 'Das Projekt bleibt auf Kurs.')
  assert.deepEqual(parseJson(row.source_message_ids), ['message-1'])
  assert.equal(row.message_count, 1)
  assert.equal(app.emitted[0].eventName, 'patched')
  assert.equal(app.emitted[0].payload.user_id, 'user-1')
})

test('message-summaries keeps find/get owner-scoped even for admins', async () => {
  const { service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-private',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'message',
        status: 'ready',
        source_message_ids: ['message-1'],
        payload: { mini_summary: 'Private' },
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-2', is_admin: true },
    query: { channel_id: 'channel-1' }
  })

  assert.deepEqual(result.data, [])
  await assert.rejects(
    service.get('summary-private', {
      provider: 'rest',
      user: { id: 'user-2', is_admin: true }
    }),
    NotFound
  )
})

test('message-summaries find repairs legacy source range fields and persists them chronologically', async () => {
  const { db, service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-legacy',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'selection',
        status: 'ready',
        source_message_ids: JSON.stringify(['message-2', 'message-1']),
        message_count: null,
        payload: JSON.stringify({ mini_summary: 'Legacy summary' }),
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { channel_id: 'channel-1' }
  })

  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].source_started_at, '2026-04-17T08:00:00.000Z')
  assert.equal(result.data[0].source_ended_at, '2026-04-17T08:05:00.000Z')
  assert.equal(result.data[0].message_count, 2)

  const storedRow = db.tables.message_summaries[0]
  assert.equal(storedRow.source_started_at, '2026-04-17T08:00:00.000Z')
  assert.equal(storedRow.source_ended_at, '2026-04-17T08:05:00.000Z')
  assert.equal(storedRow.message_count, 2)
})

test('message-summaries find filters summaries to the supplied loaded message window', async () => {
  const { service } = createService({
    seed: {
      message_summaries: [
        {
          id: 'summary-before',
          channel_id: 'channel-1',
          user_id: 'user-1',
          scope: 'selection',
          status: 'ready',
          source_message_ids: JSON.stringify(['message-old']),
          source_started_at: '2026-04-15T08:05:00.000Z',
          source_ended_at: '2026-04-15T08:05:00.000Z',
          message_count: 1,
          payload: JSON.stringify({ mini_summary: 'Before' }),
          created_at: '2026-04-17T08:10:00.000Z',
          updated_at: '2026-04-17T08:10:00.000Z'
        },
        {
          id: 'summary-overlap',
          channel_id: 'channel-1',
          user_id: 'user-1',
          scope: 'selection',
          status: 'ready',
          source_message_ids: JSON.stringify(['message-1', 'message-2']),
          source_started_at: '2026-04-17T08:00:00.000Z',
          source_ended_at: '2026-04-17T08:05:00.000Z',
          message_count: 2,
          payload: JSON.stringify({ mini_summary: 'Overlap' }),
          created_at: '2026-04-17T08:10:00.000Z',
          updated_at: '2026-04-17T08:10:00.000Z'
        },
        {
          id: 'summary-after',
          channel_id: 'channel-1',
          user_id: 'user-1',
          scope: 'selection',
          status: 'ready',
          source_message_ids: JSON.stringify(['message-1']),
          source_started_at: '2026-04-17T10:00:00.000Z',
          source_ended_at: '2026-04-17T10:00:00.000Z',
          message_count: 1,
          payload: JSON.stringify({ mini_summary: 'After' }),
          created_at: '2026-04-17T10:10:00.000Z',
          updated_at: '2026-04-17T10:10:00.000Z'
        }
      ]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: {
      channel_id: 'channel-1',
      window_start_at: '2026-04-17T08:00:00.000Z',
      window_end_at: '2026-04-17T08:05:00.000Z'
    }
  })

  assert.deepEqual(result.data.map((summary) => summary.id), ['summary-overlap'])
  assert.equal(result.total, 1)
})

test('message-summaries find uses repaired legacy ranges when filtering by window overlap', async () => {
  const { service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-legacy',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'selection',
        status: 'ready',
        source_message_ids: JSON.stringify(['message-2', 'message-1']),
        message_count: null,
        payload: JSON.stringify({ mini_summary: 'Legacy summary' }),
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: {
      channel_id: 'channel-1',
      window_start_at: '2026-04-17T08:04:00.000Z',
      window_end_at: '2026-04-17T08:05:00.000Z'
    }
  })

  assert.deepEqual(result.data.map((summary) => summary.id), ['summary-legacy'])
})

test('message-summaries find rejects partial summary windows', async () => {
  const { service } = createService()

  await assert.rejects(
    service.find({
      provider: 'rest',
      user: { id: 'user-1', is_admin: false },
      query: {
        channel_id: 'channel-1',
        window_start_at: '2026-04-17T08:04:00.000Z'
      }
    }),
    (error) => error.error_code === 'api.message_summaries.window_pair_required'
  )
})

test('message-summaries get repairs a legacy summary without emitting a realtime patch', async () => {
  const { app, db, service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-legacy',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'message',
        status: 'ready',
        source_message_ids: JSON.stringify(['message-1']),
        message_count: 99,
        payload: JSON.stringify({ mini_summary: 'Legacy summary' }),
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  const result = await service.get('summary-legacy', {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(result.source_started_at, '2026-04-17T08:00:00.000Z')
  assert.equal(result.source_ended_at, '2026-04-17T08:00:00.000Z')
  assert.equal(result.message_count, 1)
  assert.deepEqual(app.emitted, [])
  assert.equal(db.tables.message_summaries[0].message_count, 1)
})

test('message-summaries legacy repair keeps safe fallback behavior when source messages are gone', async () => {
  const { db, service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-legacy',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'selection',
        status: 'ready',
        source_message_ids: JSON.stringify(['missing-1', 'missing-2']),
        message_count: null,
        payload: JSON.stringify({ mini_summary: 'Legacy summary' }),
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  const result = await service.find({
    provider: 'rest',
    user: { id: 'user-1', is_admin: false },
    query: { channel_id: 'channel-1' }
  })

  assert.equal(result.data[0].source_started_at, undefined)
  assert.equal(result.data[0].source_ended_at, undefined)
  assert.equal(result.data[0].message_count, 2)
  assert.equal(db.tables.message_summaries[0].source_started_at, undefined)
  assert.equal(db.tables.message_summaries[0].source_ended_at, undefined)
})

test('message-summaries rejects users outside the channel membership boundary', async () => {
  const { service } = createService()

  await assert.rejects(
    service.create({
      channel_id: 'channel-1',
      scope: 'message',
      message_id: 'message-1'
    }, {
      provider: 'rest',
      user: { id: 'user-3', is_admin: false }
    }),
    Forbidden
  )
})

test('message-summaries enforces minimum source length for single messages', async () => {
  const { service } = createService({
    seed: {
      messages: [{
        id: 'short-message',
        channel_id: 'channel-1',
        user_id: 'user-2',
        content: 'Too short',
        type: 'text',
        created_at: '2026-04-17T08:00:00.000Z',
        deleted_at: null
      }]
    }
  })

  await assert.rejects(
    service.create({
      channel_id: 'channel-1',
      scope: 'message',
      message_id: 'short-message'
    }, {
      provider: 'rest',
      user: { id: 'user-1', is_admin: false }
    }),
    (error) => error.error_code === 'api.message_summaries.source_too_short'
  )
})

test('message-summaries selection preserves chronological source ordering', async () => {
  const { db, service } = createService()

  await service.create({
    channel_id: 'channel-1',
    scope: 'selection',
    message_ids: ['message-2', 'message-1']
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(parseJson(db.tables.message_summaries[0].source_message_ids), ['message-1', 'message-2'])
  assert.equal(db.tables.message_summaries[0].message_count, 2)
})

test('message-summaries range filters by time and ignores system messages', async () => {
  const { db, service } = createService()

  await service.create({
    channel_id: 'channel-1',
    scope: 'range',
    range_preset: 'last_24h'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(parseJson(db.tables.message_summaries[0].source_message_ids), ['message-1', 'message-2'])
})

test('message-summaries custom range accepts values beyond seven days', async () => {
  const { db, service } = createService()

  await service.create({
    channel_id: 'channel-1',
    scope: 'range',
    range_preset: 'custom',
    range_value: 10,
    range_unit: 'days'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.deepEqual(parseJson(db.tables.message_summaries[0].source_message_ids), ['message-old', 'message-1', 'message-2'])
})

test('message-summaries range keeps newest messages within the context limit', async () => {
  const previousLimit = process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS
  process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS = '900'
  try {
    const { db, service } = createService()

    await service.create({
      channel_id: 'channel-1',
      scope: 'range',
      range_preset: 'custom',
      range_value: 10,
      range_unit: 'days'
    }, {
      provider: 'rest',
      user: { id: 'user-1', is_admin: false }
    })

    assert.deepEqual(parseJson(db.tables.message_summaries[0].source_message_ids), ['message-2'])
    assert.equal(db.tables.message_summaries[0].message_count, 1)
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS
    } else {
      process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS = previousLimit
    }
  }
})

test('message-summaries selection rejects payloads above the context limit', async () => {
  const previousLimit = process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS
  process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS = '900'
  try {
    const { service } = createService()

    await assert.rejects(
      service.create({
        channel_id: 'channel-1',
        scope: 'selection',
        message_ids: ['message-1', 'message-2']
      }, {
        provider: 'rest',
        user: { id: 'user-1', is_admin: false }
      }),
      (error) => error.error_code === 'api.message_summaries.source_too_large'
    )
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS
    } else {
      process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS = previousLimit
    }
  }
})

test('message-summaries remove deletes only owner-scoped private artifacts', async () => {
  const { db, service } = createService({
    seed: {
      message_summaries: [{
        id: 'summary-private',
        channel_id: 'channel-1',
        user_id: 'user-1',
        scope: 'message',
        status: 'ready',
        source_message_ids: JSON.stringify(['message-1']),
        payload: JSON.stringify({ mini_summary: 'Private' }),
        created_at: '2026-04-17T08:10:00.000Z',
        updated_at: '2026-04-17T08:10:00.000Z'
      }]
    }
  })

  await assert.rejects(
    service.remove('summary-private', {
      provider: 'rest',
      user: { id: 'user-2', is_admin: true }
    }),
    NotFound
  )

  const removed = await service.remove('summary-private', {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })

  assert.equal(removed.id, 'summary-private')
  assert.deepEqual(db.tables.message_summaries, [])
})

test('message-summaries records failed status when chat summary AI is not configured', async () => {
  const { db, service } = createService({
    seed: {
      ai_function_configs: [
        { function_key: 'chat_summary', enabled: false, provider_instance_id: 'provider-1', model: 'gpt-4.1-mini' }
      ]
    }
  })

  await service.create({
    channel_id: 'channel-1',
    scope: 'message',
    message_id: 'message-1'
  }, {
    provider: 'rest',
    user: { id: 'user-1', is_admin: false }
  })
  await flushAsyncWork()

  assert.equal(db.tables.message_summaries[0].status, 'failed')
  assert.equal(db.tables.message_summaries[0].failure_code, 'api.ai.function_config_incomplete')
})
