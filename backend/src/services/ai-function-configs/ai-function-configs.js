import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import {
  AI_FUNCTION_KEYS,
  getCapabilityForFunctionKey,
  isValidFunctionKey,
  providerSupportsCapability
} from '../../lib/ai-config.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { patchSchema } from './ai-function-configs.schema.js'

export class AiFunctionConfigsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  async find() {
    const rows = await this.db('ai_function_configs').orderBy('function_key', 'asc').select('*')
    return {
      data: rows,
      total: rows.length,
      limit: rows.length
    }
  }

  async get(id) {
    if (!isValidFunctionKey(id)) {
      throw notFound('api.ai.function_config_not_found', { id }, 'AI-Funktionskonfiguration nicht gefunden')
    }

    const row = await this.db('ai_function_configs').where('function_key', id).first()
    if (!row) {
      throw notFound('api.ai.function_config_not_found', { id }, 'AI-Funktionskonfiguration nicht gefunden')
    }
    return row
  }

  async patch(id, data) {
    const functionKey = id || data.function_key
    if (!isValidFunctionKey(functionKey)) {
      throw notFound('api.ai.function_config_not_found', { id: functionKey }, 'AI-Funktionskonfiguration nicht gefunden')
    }

    const existing = await this.db('ai_function_configs').where('function_key', functionKey).first()
    if (!existing) {
      throw notFound('api.ai.function_config_not_found', { id: functionKey }, 'AI-Funktionskonfiguration nicht gefunden')
    }

    const nextConfig = {
      ...existing,
      ...data,
      function_key: functionKey
    }

    if (nextConfig.enabled) {
      if (!nextConfig.provider_instance_id || !nextConfig.model) {
        throw badRequest(
          'api.ai.function_config_incomplete',
          { functionKey },
          'Aktive AI-Funktionen brauchen Provider-Instanz und Modell'
        )
      }
    }

    let providerInstance = null
    if (nextConfig.provider_instance_id) {
      providerInstance = await this.db('ai_provider_instances')
        .where('id', nextConfig.provider_instance_id)
        .first()

      if (!providerInstance) {
        throw badRequest(
          'api.ai.provider_instance_not_found',
          { providerInstanceId: nextConfig.provider_instance_id },
          'AI-Provider-Instanz nicht gefunden'
        )
      }

      const capability = getCapabilityForFunctionKey(functionKey)
      if (!providerSupportsCapability(providerInstance.provider_type, capability)) {
        throw badRequest(
          'api.ai.provider_capability_mismatch',
          { functionKey, providerType: providerInstance.provider_type, capability },
          'Dieser Provider-Typ unterstuetzt die AI-Funktion nicht'
        )
      }
    }

    if (nextConfig.enabled && providerInstance && providerInstance.enabled !== true) {
      throw badRequest(
        'api.ai.provider_instance_disabled',
        { providerInstanceId: providerInstance.id, functionKey },
        'Aktive AI-Funktionen duerfen keine deaktivierte Provider-Instanz nutzen'
      )
    }

    const patchData = {
      enabled: nextConfig.enabled ?? false,
      provider_instance_id: nextConfig.provider_instance_id || null,
      model: nextConfig.model || null,
      updated_at: new Date().toISOString()
    }

    await this.db('ai_function_configs')
      .where('function_key', functionKey)
      .update(patchData)

    return this.get(functionKey)
  }
}

export async function listQueuedMeetingArtifactTypes(db) {
  const rows = await db('ai_function_configs')
    .where('enabled', true)
    .whereNotNull('provider_instance_id')
    .whereNotNull('model')
    .select('function_key')

  const types = []
  for (const row of rows) {
    if (row.function_key === 'transcription') {
      types.push('transcript')
    }
    if (row.function_key === 'meeting_summary') {
      types.push('summary')
    }
  }

  return [...new Set(types)]
}

export const aiFunctionConfigs = (app) => {
  app.use('ai-function-configs', new AiFunctionConfigsService({
    Model: app.get('postgresqlClient')
  }), {
    methods: ['find', 'get', 'patch'],
    events: []
  })

  app.service('ai-function-configs').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      all: [checkPermission('manage_roles', 'manage_users')],
      patch: [validate(patchSchema)]
    },
    after: {},
    error: {}
  })
}
