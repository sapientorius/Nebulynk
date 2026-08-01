import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { AiProviderModelsService } from '../src/services/ai-provider-models/ai-provider-models.js'
import { aiProviderModels } from '../src/services/ai-provider-models/ai-provider-models.js'
import { encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp() {
  return {
    get(name) {
      if (name === 'authentication') {
        return { secret: 'test-auth-secret' }
      }
      return null
    }
  }
}

function createService({ seed, fetchFn }) {
  const db = createMemoryDb(seed)
  return {
    db,
    service: new AiProviderModelsService({
      Model: db,
      app: createApp(),
      fetchFn
    })
  }
}

test('ai-provider-models service: first fetch caches results and second fetch uses cache', async () => {
  let fetchCalls = 0
  const { service, db } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'openai',
        display_name: 'OpenAI',
        enabled: true,
        base_url: 'https://api.openai.com/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_secrets: [{
        provider_instance_id: 'instance-1',
        encrypted_secret: encryptSecret(createApp(), 'secret-key'),
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    },
    fetchFn: async () => {
      fetchCalls += 1
      return {
        ok: true,
        async json() {
          return {
            data: [
              { id: 'whisper-1' },
              { id: 'gpt-4o-transcribe' },
              { id: 'gpt-4o-mini-transcribe' },
              { id: 'gpt-4.1-mini' }
            ]
          }
        }
      }
    }
  })

  const first = await service.find({
    query: { provider_instance_id: 'instance-1', capability: 'transcription' }
  })
  const second = await service.find({
    query: { provider_instance_id: 'instance-1', capability: 'transcription' }
  })

  assert.equal(fetchCalls, 1)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.equal(db.tables.ai_provider_model_cache.length, 1)
  assert.equal(typeof db.tables.ai_provider_model_cache[0].models, 'string')
  assert.deepEqual(second.data.map((model) => model.id), [
    'gpt-4o-mini-transcribe',
    'gpt-4o-transcribe',
    'whisper-1'
  ])
  const whisper = second.data.find((model) => model.id === 'whisper-1')
  const gpt4oMini = second.data.find((model) => model.id === 'gpt-4o-mini-transcribe')
  assert.equal(whisper.supports_timestamps, true)
  assert.equal(whisper.supports_speaker_merge, true)
  assert.equal(gpt4oMini.supports_timestamps, false)
  assert.equal(gpt4oMini.supports_speaker_merge, false)
})

test('ai-provider-models hook-chain: non-admin model discovery is forbidden', async () => {
  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', createMemoryDb())
  aiProviderModels(app)

  await assert.rejects(
    app.service('ai-provider-models').find({
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set(),
      query: {
        provider_instance_id: 'instance-1',
        capability: 'meeting_summary'
      }
    }),
    Forbidden
  )
})

test('ai-provider-models service: refresh overwrites cache and stale cache is reused on provider failure', async () => {
  let shouldFail = false
  let fetchCalls = 0
  const { service, db } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'openai',
        display_name: 'OpenAI',
        enabled: true,
        base_url: 'https://api.openai.com/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_secrets: [{
        provider_instance_id: 'instance-1',
        encrypted_secret: encryptSecret(createApp(), 'secret-key'),
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    },
    fetchFn: async () => {
      fetchCalls += 1
      if (shouldFail) {
        throw new Error('upstream unavailable')
      }
      return {
        ok: true,
        async json() {
          return {
            data: [
              { id: 'gpt-4.1-mini' }
            ]
          }
        }
      }
    }
  })

  await service.find({
    query: { provider_instance_id: 'instance-1', capability: 'meeting_summary' }
  })

  shouldFail = true
  const fallback = await service.find({
    query: {
      provider_instance_id: 'instance-1',
      capability: 'meeting_summary',
      refresh: 'true'
    }
  })

  assert.equal(fetchCalls, 2)
  assert.equal(fallback.cached, true)
  assert.equal(fallback.stale, true)
  assert.equal(fallback.last_fetch_status, 'failed')
  assert.equal(db.tables.ai_provider_model_cache[0].last_fetch_error, 'upstream unavailable')
})

test('ai-provider-models service: cached JSON string is normalized for API responses', async () => {
  const { service } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'openai',
        display_name: 'OpenAI',
        enabled: true,
        base_url: 'https://api.openai.com/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_model_cache: [{
        id: 'cache-1',
        provider_instance_id: 'instance-1',
        capability: 'meeting_summary',
        models: JSON.stringify([
          { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', capabilities: ['meeting_summary'] }
        ]),
        fetched_at: '2026-03-21T10:00:00.000Z',
        expires_at: '2099-03-21T11:00:00.000Z',
        last_fetch_status: 'ready',
        last_fetch_error: null,
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    }
  })

  const result = await service.find({
    query: { provider_instance_id: 'instance-1', capability: 'meeting_summary' }
  })

  assert.equal(result.cached, true)
  assert.deepEqual(result.data, [
    { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini', capabilities: ['meeting_summary'] }
  ])
})

test('ai-provider-models service: invalid cached JSON is rejected explicitly', async () => {
  const { service } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'openai',
        display_name: 'OpenAI',
        enabled: true,
        base_url: 'https://api.openai.com/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_model_cache: [{
        id: 'cache-1',
        provider_instance_id: 'instance-1',
        capability: 'meeting_summary',
        models: '{broken-json',
        fetched_at: '2026-03-21T10:00:00.000Z',
        expires_at: '2099-03-21T11:00:00.000Z',
        last_fetch_status: 'ready',
        last_fetch_error: null,
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    }
  })

  await assert.rejects(
    service.find({
      query: { provider_instance_id: 'instance-1', capability: 'meeting_summary' }
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.model_cache_invalid')
      return true
    }
  )
})

test('ai-provider-models service: mistral transcription only exposes voxtral models with context bias support', async () => {
  const { service } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'mistral',
        display_name: 'Mistral',
        enabled: true,
        base_url: 'https://api.mistral.ai/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_secrets: [{
        provider_instance_id: 'instance-1',
        encrypted_secret: encryptSecret(createApp(), 'secret-key'),
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    },
    fetchFn: async () => ({
      ok: true,
      async json() {
        return {
          data: [
            { id: 'voxtral-mini-latest' },
            { id: 'mistral-small-latest' }
          ]
        }
      }
    })
  })

  const result = await service.find({
    query: { provider_instance_id: 'instance-1', capability: 'transcription' }
  })

  assert.deepEqual(result.data.map((model) => model.id), ['voxtral-mini-latest'])
  assert.equal(result.data[0].supports_context_bias, true)
  assert.equal(result.data[0].supports_timestamps, true)
})

test('ai-provider-models service: legacy unsafe stored base_url is rejected before outbound fetch', async () => {
  let fetchCalls = 0
  const { service } = createService({
    seed: {
      ai_provider_instances: [{
        id: 'instance-1',
        provider_type: 'openai_compatible',
        display_name: 'Unsafe internal gateway',
        enabled: true,
        base_url: 'https://llm.internal.example/v1',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }],
      ai_provider_secrets: [{
        provider_instance_id: 'instance-1',
        encrypted_secret: encryptSecret(createApp(), 'secret-key'),
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:00:00.000Z'
      }]
    },
    fetchFn: async () => {
      fetchCalls += 1
      return {
        ok: true,
        async json() {
          return { data: [] }
        }
      }
    }
  })

  service.options.env = { NODE_ENV: 'production' }
  service.options.lookupFn = async () => [{ address: '10.24.3.9' }]

  await assert.rejects(
    service.find({
      query: { provider_instance_id: 'instance-1', capability: 'meeting_summary' }
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.model_fetch_failed')
      assert.ok(typeof error.message === 'string' && error.message.length > 0)
      return true
    }
  )

  assert.equal(fetchCalls, 0)
})
