import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { encryptSecret } from '../../lib/ai-secrets.js'
import {
  assertProviderBaseUrlAllowed,
  getProviderMetadata,
  normalizeProviderBaseUrlForStorage
} from '../../lib/ai-config.js'
import { createSchema, patchSchema } from './ai-provider-instances.schema.js'

function sanitizeInstance(instance) {
  const metadata = getProviderMetadata(instance.provider_type)
  return {
    id: instance.id,
    provider_type: instance.provider_type,
    provider_label: metadata?.label || instance.provider_type,
    display_name: instance.display_name,
    enabled: instance.enabled,
    base_url: instance.base_url,
    capabilities: metadata?.capabilities || {},
    created_at: instance.created_at,
    updated_at: instance.updated_at
  }
}

export class AiProviderInstancesService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  get env() {
    return this.options.env || process.env
  }

  get lookupFn() {
    return this.options.lookupFn
  }

  async find() {
    const rows = await this.db('ai_provider_instances')
      .orderBy('created_at', 'asc')
      .select('*')

    return {
      data: rows.map(sanitizeInstance),
      total: rows.length,
      limit: rows.length
    }
  }

  async get(id) {
    const row = await this.db('ai_provider_instances').where('id', id).first()
    if (!row) {
      throw notFound('api.ai.provider_instance_not_found', { id }, 'AI-Provider-Instanz nicht gefunden')
    }
    return sanitizeInstance(row)
  }

  async create(data) {
    const resolvedBaseUrl = await assertProviderBaseUrlAllowed({
      providerType: data.provider_type,
      baseUrl: data.base_url || null,
      env: this.env,
      lookupFn: this.lookupFn
    })

    const nowIso = new Date().toISOString()
    const id = createId()
    const instance = {
      id,
      provider_type: data.provider_type,
      display_name: data.display_name.trim(),
      enabled: data.enabled ?? true,
      base_url: normalizeProviderBaseUrlForStorage(data.provider_type, resolvedBaseUrl),
      created_at: nowIso,
      updated_at: nowIso
    }

    await this.db.transaction(async (trx) => {
      await trx('ai_provider_instances').insert(instance)
      await trx('ai_provider_secrets').insert({
        provider_instance_id: id,
        encrypted_secret: encryptSecret(this.app, data.api_key),
        created_at: nowIso,
        updated_at: nowIso
      })
    })

    return sanitizeInstance(instance)
  }

  async patch(id, data) {
    const existing = await this.db('ai_provider_instances').where('id', id).first()
    if (!existing) {
      throw notFound('api.ai.provider_instance_not_found', { id }, 'AI-Provider-Instanz nicht gefunden')
    }

    if (typeof data.provider_type === 'string' && data.provider_type !== existing.provider_type) {
      throw badRequest(
        'api.ai.provider_type_immutable',
        { id },
        'Der Provider-Typ einer bestehenden Instanz kann nicht geaendert werden'
      )
    }

    const nextProviderType = existing.provider_type
    const nextBaseUrl = Object.prototype.hasOwnProperty.call(data, 'base_url')
      ? data.base_url
      : existing.base_url

    await assertProviderBaseUrlAllowed({
      providerType: nextProviderType,
      baseUrl: nextBaseUrl,
      env: this.env,
      lookupFn: this.lookupFn
    })

    const patchData = {}
    if (typeof data.display_name === 'string') {
      patchData.display_name = data.display_name.trim()
    }
    if (typeof data.enabled === 'boolean') {
      patchData.enabled = data.enabled
    }
    if (Object.prototype.hasOwnProperty.call(data, 'base_url')) {
      patchData.base_url = normalizeProviderBaseUrlForStorage(nextProviderType, data.base_url)
    }

    patchData.updated_at = new Date().toISOString()

    await this.db.transaction(async (trx) => {
      await trx('ai_provider_instances').where('id', id).update(patchData)

      if (typeof data.api_key === 'string' && data.api_key.trim().length > 0) {
        await trx('ai_provider_secrets')
          .where('provider_instance_id', id)
          .update({
            encrypted_secret: encryptSecret(this.app, data.api_key),
            updated_at: patchData.updated_at
          })
      }
    })

    const updated = await this.db('ai_provider_instances').where('id', id).first()
    return sanitizeInstance(updated)
  }

  async remove(id) {
    const existing = await this.db('ai_provider_instances').where('id', id).first()
    if (!existing) {
      throw notFound('api.ai.provider_instance_not_found', { id }, 'AI-Provider-Instanz nicht gefunden')
    }

    const linkedFunction = await this.db('ai_function_configs')
      .where('provider_instance_id', id)
      .first()

    if (linkedFunction) {
      throw badRequest(
        'api.ai.provider_instance_in_use',
        { id, functionKey: linkedFunction.function_key },
        'AI-Provider-Instanz wird noch von einer AI-Funktion verwendet'
      )
    }

    await this.db('ai_provider_instances').where('id', id).del()
    return sanitizeInstance(existing)
  }
}

export const aiProviderInstances = (app) => {
  const service = new AiProviderInstancesService({
    Model: app.get('postgresqlClient'),
    app
  })

  app.use('ai-provider-instances', service, {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  app.service('ai-provider-instances').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      all: [checkPermission('manage_roles', 'manage_users')],
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    },
    after: {},
    error: {}
  })
}
