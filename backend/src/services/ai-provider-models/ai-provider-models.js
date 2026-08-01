import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { decryptSecret } from '../../lib/ai-secrets.js'
import { listProviderModels } from '../../lib/ai-provider-adapters.js'
import { MODEL_CACHE_TTL_MS } from '../../lib/ai-config.js'
import { badRequest, notFound } from '../../lib/errors.js'

function normalizeRefresh(value) {
  return value === true || value === 'true'
}

function normalizeCachedModels(cacheRow, providerInstanceId, capability) {
  const rawModels = cacheRow?.models

  if (Array.isArray(rawModels)) {
    return rawModels
  }

  if (typeof rawModels === 'string') {
    try {
      const parsed = JSON.parse(rawModels)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // Handled below with a structured error.
    }
  }

  throw badRequest(
    'api.ai.model_cache_invalid',
    { providerInstanceId, capability },
    'Gespeicherter Model-Cache ist ungueltig'
  )
}

export class AiProviderModelsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get fetchFn() {
    return this.options.fetchFn || globalThis.fetch
  }

  get lookupFn() {
    return this.options.lookupFn
  }

  get env() {
    return this.options.env || process.env
  }

  get app() {
    return this.options.app
  }

  async find(params) {
    const providerInstanceId = typeof params?.query?.provider_instance_id === 'string'
      ? params.query.provider_instance_id
      : null
    const capability = typeof params?.query?.capability === 'string'
      ? params.query.capability
      : null
    const refresh = normalizeRefresh(params?.query?.refresh)

    if (!providerInstanceId || !capability) {
      throw badRequest(
        'api.ai.models_query_invalid',
        {},
        'provider_instance_id und capability sind erforderlich'
      )
    }

    const providerInstance = await this.db('ai_provider_instances')
      .where('id', providerInstanceId)
      .first()

    if (!providerInstance) {
      throw notFound(
        'api.ai.provider_instance_not_found',
        { providerInstanceId },
        'AI-Provider-Instanz nicht gefunden'
      )
    }

    const cacheRow = await this.db('ai_provider_model_cache')
      .where({
        provider_instance_id: providerInstanceId,
        capability
      })
      .first()

    const now = Date.now()
    const isCacheUsable = cacheRow && !refresh && new Date(cacheRow.expires_at).getTime() > now
    if (isCacheUsable) {
      const cachedModels = normalizeCachedModels(cacheRow, providerInstanceId, capability)
      return {
        data: cachedModels,
        provider_instance_id: providerInstanceId,
        capability,
        cached: true,
        stale: false,
        fetched_at: cacheRow.fetched_at,
        expires_at: cacheRow.expires_at,
        last_fetch_status: cacheRow.last_fetch_status || 'ready',
        last_fetch_error: cacheRow.last_fetch_error || null
      }
    }

    const secretRow = await this.db('ai_provider_secrets')
      .where('provider_instance_id', providerInstanceId)
      .first()

    if (!secretRow) {
      throw notFound(
        'api.ai.provider_secret_not_found',
        { providerInstanceId },
        'AI-Provider-Secret nicht gefunden'
      )
    }

    try {
      const models = await listProviderModels({
        providerType: providerInstance.provider_type,
        apiKey: decryptSecret(this.app, secretRow.encrypted_secret),
        baseUrl: providerInstance.base_url,
        capability,
        fetchFn: this.fetchFn,
        env: this.env,
        lookupFn: this.lookupFn
      })

      const nowIso = new Date().toISOString()
      const expiresAtIso = new Date(Date.now() + MODEL_CACHE_TTL_MS).toISOString()
      const payload = {
        provider_instance_id: providerInstanceId,
        capability,
        models: JSON.stringify(models),
        fetched_at: nowIso,
        expires_at: expiresAtIso,
        last_fetch_status: 'ready',
        last_fetch_error: null,
        updated_at: nowIso
      }

      if (cacheRow) {
        await this.db('ai_provider_model_cache')
          .where('id', cacheRow.id)
          .update(payload)
      } else {
        await this.db('ai_provider_model_cache').insert({
          id: createId(),
          created_at: nowIso,
          ...payload
        })
      }

      return {
        data: models,
        provider_instance_id: providerInstanceId,
        capability,
        cached: false,
        stale: false,
        fetched_at: nowIso,
        expires_at: expiresAtIso,
        last_fetch_status: 'ready',
        last_fetch_error: null
      }
    } catch (error) {
      if (cacheRow) {
        const cachedModels = normalizeCachedModels(cacheRow, providerInstanceId, capability)
        await this.db('ai_provider_model_cache')
          .where('id', cacheRow.id)
          .update({
            last_fetch_status: 'failed',
            last_fetch_error: error.message,
            updated_at: new Date().toISOString()
          })

        return {
          data: cachedModels,
          provider_instance_id: providerInstanceId,
          capability,
          cached: true,
          stale: true,
          fetched_at: cacheRow.fetched_at,
          expires_at: cacheRow.expires_at,
          last_fetch_status: 'failed',
          last_fetch_error: error.message
        }
      }

      throw badRequest(
        'api.ai.model_fetch_failed',
        { providerInstanceId, capability, detail: error.message },
        'Modelle konnten nicht geladen werden'
      )
    }
  }
}

export const aiProviderModels = (app) => {
  app.use('ai-provider-models', new AiProviderModelsService({
    Model: app.get('postgresqlClient'),
    app
  }), {
    methods: ['find'],
    events: []
  })

  app.service('ai-provider-models').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      all: [checkPermission('manage_roles', 'manage_users')]
    },
    after: {},
    error: {}
  })
}
