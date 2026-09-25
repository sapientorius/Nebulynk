import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import {
  getCapabilityForFunctionKey,
  isValidFunctionKey,
  providerSupportsCapability
} from '../../lib/ai-config.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { verificationStatus, verifyAiFunctionConfiguration } from '../../lib/ai-compatibility.js'
import { patchSchema } from './ai-function-configs.schema.js'

export class AiFunctionConfigsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  get verifyConfiguration() {
    return this.options.verifyConfiguration || verifyAiFunctionConfiguration
  }

  present(row, providerInstance, secretUpdatedAt) {
    const publicRow = { ...row }
    delete publicRow.request_profile
    delete publicRow.verification_fingerprint
    return { ...publicRow, verification_status: verificationStatus(row, providerInstance, secretUpdatedAt) }
  }

  async find() {
    const rows = await this.db('ai_function_configs').orderBy('function_key', 'asc').select('*')
    const providers = await this.db('ai_provider_instances').select('*')
    const secrets = await this.db('ai_provider_secrets').select('provider_instance_id', 'updated_at')
    const providerById = new Map(providers.map((row) => [row.id, row]))
    const secretByProviderId = new Map(secrets.map((row) => [row.provider_instance_id, row]))
    return {
      data: rows.map((row) => this.present(row, providerById.get(row.provider_instance_id), secretByProviderId.get(row.provider_instance_id)?.updated_at)),
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
    const providerInstance = row.provider_instance_id
      ? await this.db('ai_provider_instances').where('id', row.provider_instance_id).first()
      : null
    const secretRow = row.provider_instance_id
      ? await this.db('ai_provider_secrets').where('provider_instance_id', row.provider_instance_id).first()
      : null
    return this.present(row, providerInstance, secretRow?.updated_at)
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

    let verification = {
      request_profile: null,
      verified_at: null,
      verification_fingerprint: null,
      verification_error: null
    }
    if (nextConfig.enabled) {
      verification = await this.verifyConfiguration({
        db: this.db,
        app: this.app,
        providerInstance,
        functionKey,
        model: nextConfig.model
      })
    }

    const patchData = {
      enabled: nextConfig.enabled ?? false,
      provider_instance_id: nextConfig.provider_instance_id || null,
      model: nextConfig.model || null,
      ...verification,
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
    Model: app.get('postgresqlClient'),
    app
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
