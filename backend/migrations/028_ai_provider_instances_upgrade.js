import { createId } from '@paralleldrive/cuid2'

const MIGRATED_SETTING_KEYS = [
  ['transcription_provider', 'transcription_provider_instance_id'],
  ['meeting_summary_provider', 'meeting_summary_provider_instance_id']
]

async function ensureSetting(knex, key, value) {
  const existing = await knex('ai_settings').where({ key }).first()
  if (!existing) {
    await knex('ai_settings').insert({
      key,
      value,
      updated_at: knex.fn.now()
    })
    return
  }

  await knex('ai_settings').where({ key }).update({
    value,
    updated_at: knex.fn.now()
  })
}

export async function up(knex) {
  const hasProviderInstances = await knex.schema.hasTable('ai_provider_instances')
  if (!hasProviderInstances) {
    await knex.schema.createTable('ai_provider_instances', (table) => {
      table.string('id').primary()
      table.string('provider_type').notNullable()
      table.boolean('enabled').notNullable().defaultTo(false)
      table.string('display_name').notNullable()
      table.string('base_url').nullable()
      table.string('default_model').nullable()
      table.jsonb('last_check_status').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    })
  }

  const hasProviderSecrets = await knex.schema.hasTable('ai_provider_secrets')
  if (hasProviderSecrets) {
    const hasProviderInstanceId = await knex.schema.hasColumn('ai_provider_secrets', 'provider_instance_id')
    if (!hasProviderInstanceId) {
      await knex.schema.alterTable('ai_provider_secrets', (table) => {
        table.string('provider_instance_id').nullable()
      })
    }
  }

  const hasModelCache = await knex.schema.hasTable('ai_provider_model_cache')
  if (!hasModelCache) {
    await knex.schema.createTable('ai_provider_model_cache', (table) => {
      table.string('id').primary()
      table.string('provider_instance_id').notNullable()
      table.string('capability').notNullable()
      table.jsonb('models').notNullable()
      table.timestamp('fetched_at', { useTz: true }).notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
      table.unique(['provider_instance_id', 'capability'], {
        indexName: 'ai_provider_model_cache_provider_instance_id_capability_unique'
      })
    })
  }

  const configsTableExists = await knex.schema.hasTable('ai_provider_configs')
  if (!configsTableExists) return

  const configs = await knex('ai_provider_configs').select(
    'id',
    'provider',
    'enabled',
    'display_name',
    'base_url',
    'default_model',
    'last_check_status',
    'created_at',
    'updated_at'
  )

  for (const config of configs) {
    const existing = await knex('ai_provider_instances').where({ id: config.id }).first()
    const payload = {
      provider_type: config.provider,
      enabled: config.enabled,
      display_name: config.display_name,
      base_url: config.base_url,
      default_model: config.default_model,
      last_check_status: config.last_check_status
    }

    if (!existing) {
      await knex('ai_provider_instances').insert({
        id: config.id || createId(),
        created_at: config.created_at ?? knex.fn.now(),
        updated_at: config.updated_at ?? knex.fn.now(),
        ...payload
      })
      continue
    }

    await knex('ai_provider_instances').where({ id: config.id }).update({
      ...payload,
      updated_at: knex.fn.now()
    })
  }

  if (hasProviderSecrets) {
    const secrets = await knex('ai_provider_secrets').select('id', 'provider', 'provider_instance_id')
    for (const secret of secrets) {
      if (secret.provider_instance_id) continue

      const matchingConfig = configs.find((config) => config.provider === secret.provider)
      if (!matchingConfig) continue

      await knex('ai_provider_secrets').where({ id: secret.id }).update({
        provider_instance_id: matchingConfig.id,
        updated_at: knex.fn.now()
      })
    }
  }

  const hasAiSettings = await knex.schema.hasTable('ai_settings')
  if (!hasAiSettings) return

  for (const [legacyKey, nextKey] of MIGRATED_SETTING_KEYS) {
    const legacySetting = await knex('ai_settings').where({ key: legacyKey }).first()
    const existingNextSetting = await knex('ai_settings').where({ key: nextKey }).first()

    let nextValue = existingNextSetting?.value ?? null
    if (!nextValue && legacySetting?.value) {
      const matchingConfig = configs.find((config) => config.provider === legacySetting.value)
      nextValue = matchingConfig?.id ?? null
    }

    if (legacySetting || existingNextSetting) {
      await ensureSetting(knex, nextKey, nextValue)
    }

    if (legacySetting) {
      await knex('ai_settings').where({ key: legacyKey }).del()
    }
  }
}

export async function down(knex) {
  const hasAiSettings = await knex.schema.hasTable('ai_settings')
  const hasProviderInstances = await knex.schema.hasTable('ai_provider_instances')

  if (hasAiSettings && hasProviderInstances) {
    const instances = await knex('ai_provider_instances').select('id', 'provider_type')

    for (const [legacyKey, nextKey] of MIGRATED_SETTING_KEYS) {
      const nextSetting = await knex('ai_settings').where({ key: nextKey }).first()
      if (nextSetting?.value) {
        const matchingInstance = instances.find((instance) => instance.id === nextSetting.value)
        await ensureSetting(knex, legacyKey, matchingInstance?.provider_type ?? null)
      }
      await knex('ai_settings').where({ key: nextKey }).del()
    }
  }

  const hasProviderSecrets = await knex.schema.hasTable('ai_provider_secrets')
  if (hasProviderSecrets) {
    const hasProviderInstanceId = await knex.schema.hasColumn('ai_provider_secrets', 'provider_instance_id')
    if (hasProviderInstanceId) {
      await knex.schema.alterTable('ai_provider_secrets', (table) => {
        table.dropColumn('provider_instance_id')
      })
    }
  }

  await knex.schema.dropTableIfExists('ai_provider_model_cache')
  await knex.schema.dropTableIfExists('ai_provider_instances')
}
