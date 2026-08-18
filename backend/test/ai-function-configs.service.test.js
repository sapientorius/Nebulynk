import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { Forbidden } from '@feathersjs/errors'
import {
  aiFunctionConfigs,
  AiFunctionConfigsService,
  listQueuedMeetingArtifactTypes
} from '../src/services/ai-function-configs/ai-function-configs.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createAppHarness(db) {
  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', db)
  aiFunctionConfigs(app)
  return app
}

test('ai-function-configs hook-chain: non-admin writes are forbidden', async () => {
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: false,
      provider_instance_id: null,
      model: null,
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })
  const app = createAppHarness(db)

  await assert.rejects(
    app.service('ai-function-configs').patch('transcription', { enabled: false }, {
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )
})

test('ai-function-configs service: enabling requires complete config and matching capability', async () => {
  const db = createMemoryDb({
    ai_provider_instances: [{
      id: 'instance-1',
      provider_type: 'anthropic',
      display_name: 'Anthropic',
      enabled: true,
      base_url: 'https://api.anthropic.com/v1',
      created_at: '2026-03-21T10:00:00.000Z',
      updated_at: '2026-03-21T10:00:00.000Z'
    }, {
      id: 'instance-2',
      provider_type: 'openai',
      display_name: 'OpenAI',
      enabled: false,
      base_url: 'https://api.openai.com/v1',
      created_at: '2026-03-21T10:00:00.000Z',
      updated_at: '2026-03-21T10:00:00.000Z'
    }],
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: false,
      provider_instance_id: null,
      model: null,
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })
  const service = new AiFunctionConfigsService({ Model: db })

  await assert.rejects(
    service.patch('transcription', { enabled: true }),
    /brauchen Provider-Instanz und Modell/
  )

  await assert.rejects(
    service.patch('transcription', {
      enabled: true,
      provider_instance_id: 'instance-1',
      model: 'claude-3-7-sonnet'
    }),
    /unterstuetzt die AI-Funktion nicht/
  )

  await assert.rejects(
    service.patch('transcription', {
      enabled: true,
      provider_instance_id: 'instance-2',
      model: 'whisper-1'
    }),
    /deaktivierte Provider-Instanz/
  )
})

test('ai-function-configs service: enables transcription with an active OpenRouter instance', async () => {
  const db = createMemoryDb({
    ai_provider_instances: [{
      id: 'openrouter-1',
      provider_type: 'openrouter',
      display_name: 'OpenRouter',
      enabled: true,
      base_url: 'https://openrouter.ai/api/v1',
      created_at: '2026-03-21T10:00:00.000Z',
      updated_at: '2026-03-21T10:00:00.000Z'
    }],
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: false,
      provider_instance_id: null,
      model: null,
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })
  const service = new AiFunctionConfigsService({ Model: db })

  const result = await service.patch('transcription', {
    enabled: true,
    provider_instance_id: 'openrouter-1',
    model: 'openai/whisper-1'
  })

  assert.equal(result.enabled, true)
  assert.equal(result.provider_instance_id, 'openrouter-1')
  assert.equal(result.model, 'openai/whisper-1')
})

test('ai-function-configs service: queued meeting artifact types reflect enabled and complete AI configs', async () => {
  const db = createMemoryDb({
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'instance-1',
      model: 'whisper-1',
      updated_at: '2026-03-21T10:00:00.000Z'
    }, {
      function_key: 'meeting_summary',
      enabled: false,
      provider_instance_id: 'instance-2',
      model: 'gpt-4.1-mini',
      updated_at: '2026-03-21T10:00:00.000Z'
    }, {
      function_key: 'chat_summary',
      enabled: true,
      provider_instance_id: 'instance-2',
      model: 'gpt-4.1-mini',
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })

  const result = await listQueuedMeetingArtifactTypes(db)
  assert.deepEqual(result, ['transcript'])
})

test('ai-function-configs service: chat summaries use text-summary model capability', async () => {
  const db = createMemoryDb({
    ai_provider_instances: [{
      id: 'instance-1',
      provider_type: 'anthropic',
      display_name: 'Anthropic',
      enabled: true,
      base_url: 'https://api.anthropic.com/v1',
      created_at: '2026-03-21T10:00:00.000Z',
      updated_at: '2026-03-21T10:00:00.000Z'
    }],
    ai_function_configs: [{
      function_key: 'chat_summary',
      enabled: false,
      provider_instance_id: null,
      model: null,
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })
  const service = new AiFunctionConfigsService({ Model: db })

  const result = await service.patch('chat_summary', {
    enabled: true,
    provider_instance_id: 'instance-1',
    model: 'claude-3-7-sonnet'
  })

  assert.equal(result.function_key, 'chat_summary')
  assert.equal(result.enabled, true)
  assert.equal(result.provider_instance_id, 'instance-1')
})
