import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { BadRequest, Forbidden } from '@feathersjs/errors'
import { aiProviderInstances, AiProviderInstancesService } from '../src/services/ai-provider-instances/ai-provider-instances.js'
import { decryptSecret, encryptSecret } from '../src/lib/ai-secrets.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createAppHarness(db) {
  const app = feathers()
  app.defaultAuthentication = () => ({
    async authenticate() {
      return {}
    }
  })
  app.set('postgresqlClient', db)
  app.set('authentication', { secret: 'test-auth-secret' })
  aiProviderInstances(app)
  return app
}

test('ai-provider-instances service: create allows multiple instances of the same provider type without leaking secrets', async () => {
  const db = createMemoryDb()
  const service = new AiProviderInstancesService({
    Model: db,
    app: {
      get(name) {
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  const first = await service.create({
    provider_type: 'openai',
    display_name: 'OpenAI Team A',
    api_key: 'secret-one',
    enabled: true
  })
  const second = await service.create({
    provider_type: 'openai',
    display_name: 'OpenAI Backup',
    api_key: 'secret-two',
    enabled: false
  })
  const listed = await service.find()

  assert.equal(first.provider_type, 'openai')
  assert.equal(second.provider_type, 'openai')
  assert.equal(listed.data.length, 2)
  assert.equal('api_key' in listed.data[0], false)
  assert.equal(db.tables.ai_provider_secrets.length, 2)
  assert.equal(
    decryptSecret({ get: () => ({ secret: 'test-auth-secret' }) }, db.tables.ai_provider_secrets[0].encrypted_secret),
    'secret-one'
  )
})

test('ai-provider-instances hook-chain: non-admin reads are forbidden', async () => {
  const app = createAppHarness(createMemoryDb())

  await assert.rejects(
    app.service('ai-provider-instances').find({
      provider: 'rest',
      authenticated: true,
      user: { id: 'user-1', is_admin: false },
      resolvedPermissions: new Set()
    }),
    Forbidden
  )
})

test('ai-provider-instances service: remove rejects provider instances that are still assigned to a function', async () => {
  const db = createMemoryDb({
    ai_provider_instances: [{
      id: 'instance-1',
      provider_type: 'openai',
      display_name: 'OpenAI Team',
      enabled: true,
      base_url: 'https://api.openai.com/v1',
      created_at: '2026-03-21T10:00:00.000Z',
      updated_at: '2026-03-21T10:00:00.000Z'
    }],
    ai_function_configs: [{
      function_key: 'transcription',
      enabled: true,
      provider_instance_id: 'instance-1',
      model: 'whisper-1',
      updated_at: '2026-03-21T10:00:00.000Z'
    }]
  })
  const service = new AiProviderInstancesService({ Model: db, app: { get() { return { secret: 'x' } } } })

  await assert.rejects(
    service.remove('instance-1'),
    /AI-Provider-Instanz wird noch von einer AI-Funktion verwendet/
  )
})

test('ai-provider-instances service: production create accepts public https base_url for openai_compatible', async () => {
  const db = createMemoryDb()
  const service = new AiProviderInstancesService({
    Model: db,
    env: { NODE_ENV: 'production' },
    lookupFn: async () => [{ address: '93.184.216.34' }],
    app: {
      get(name) {
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  const created = await service.create({
    provider_type: 'openai_compatible',
    display_name: 'Internal Gateway',
    api_key: 'secret-key',
    base_url: 'https://gateway.example.com/v1/',
    enabled: true
  })

  assert.equal(created.base_url, 'https://gateway.example.com/v1')
  assert.equal(db.tables.ai_provider_instances[0].base_url, 'https://gateway.example.com/v1')
})

test('ai-provider-instances service: production create rejects unsafe openai_compatible base_url variants', async () => {
  const db = createMemoryDb()
  const service = new AiProviderInstancesService({
    Model: db,
    env: { NODE_ENV: 'production' },
    lookupFn: async (hostname) => {
      if (hostname === 'public.example.com') return [{ address: '93.184.216.34' }]
      return [{ address: '10.24.3.9' }]
    },
    app: {
      get(name) {
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  for (const [baseUrl, errorCode] of [
    ['http://public.example.com/v1', 'api.ai.base_url_https_required'],
    ['https://localhost/v1', 'api.ai.base_url_private_host_forbidden'],
    ['https://private.example.com/v1', 'api.ai.base_url_private_host_forbidden'],
    ['https://user:pass@public.example.com/v1', 'api.ai.base_url_invalid']
  ]) {
    await assert.rejects(
      service.create({
        provider_type: 'openai_compatible',
        display_name: 'Unsafe endpoint',
        api_key: 'secret-key',
        base_url: baseUrl,
        enabled: true
      }),
      (error) => {
        assert.ok(error instanceof BadRequest)
        assert.equal(error.data?.error_code, errorCode)
        return true
      }
    )
  }
})

test('ai-provider-instances service: production create allows exact allowlisted internal base_url', async () => {
  const db = createMemoryDb()
  const service = new AiProviderInstancesService({
    Model: db,
    env: {
      NODE_ENV: 'production',
      AI_PROVIDER_BASE_URL_ALLOWLIST: 'https://llm.internal.example/v1'
    },
    lookupFn: async () => [{ address: '10.24.3.9' }],
    app: {
      get(name) {
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  const created = await service.create({
    provider_type: 'openai_compatible',
    display_name: 'Allowlisted gateway',
    api_key: 'secret-key',
    base_url: 'https://llm.internal.example/v1',
    enabled: true
  })

  assert.equal(created.base_url, 'https://llm.internal.example/v1')
})

test('ai-provider-instances service: custom base_url is rejected for built-in providers', async () => {
  const db = createMemoryDb()
  const service = new AiProviderInstancesService({
    Model: db,
    app: {
      get(name) {
        if (name === 'authentication') return { secret: 'test-auth-secret' }
        return null
      }
    }
  })

  await assert.rejects(
    service.create({
      provider_type: 'openai',
      display_name: 'OpenAI proxy',
      api_key: 'secret-key',
      base_url: 'https://proxy.example.com/v1',
      enabled: true
    }),
    (error) => {
      assert.ok(error instanceof BadRequest)
      assert.equal(error.data?.error_code, 'api.ai.base_url_not_supported_for_provider')
      return true
    }
  )
})

test('decryptSecret remains compatible with provider secrets encrypted before JWT secret hardening', () => {
  const legacyApp = {
    get(name) {
      if (name === 'authentication') return { secret: 'change-me-in-production' }
      return null
    }
  }
  const currentApp = {
    get(name) {
      if (name === 'authentication') return { secret: 'dev-secret-change-in-production' }
      return null
    }
  }

  const encryptedSecret = encryptSecret(legacyApp, 'legacy-provider-secret')

  assert.equal(
    decryptSecret(currentApp, encryptedSecret),
    'legacy-provider-secret'
  )
})
