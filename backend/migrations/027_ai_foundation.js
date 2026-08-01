import { createId } from '@paralleldrive/cuid2'

const PROVIDER_SEEDS = [
  {
    provider: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    capabilities: {
      chat: true,
      actions: true,
      summary: true,
      transcription: true
    }
  },
  {
    provider: 'mistral',
    displayName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    capabilities: {
      chat: true,
      actions: true,
      summary: true,
      transcription: true
    }
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    capabilities: {
      chat: true,
      actions: true,
      summary: true,
      transcription: false
    }
  },
  {
    provider: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    capabilities: {
      chat: true,
      actions: true,
      summary: true,
      transcription: false
    }
  },
  {
    provider: 'openai_compatible',
    displayName: 'OpenAI-compatible',
    baseUrl: 'http://localhost:11434/v1',
    capabilities: {
      chat: true,
      actions: true,
      summary: true,
      transcription: true
    }
  }
]

const SETTING_SEEDS = [
  ['default_transcription_enabled', 'false'],
  ['default_transcription_provider', 'openai'],
  ['default_transcription_model', null],
  ['transcription_enabled', 'false'],
  ['transcription_provider', 'openai'],
  ['transcription_model', null],
  ['meeting_summary_enabled', 'false'],
  ['meeting_summary_provider', null],
  ['meeting_summary_model', null]
]

function createDisabledStatus(provider) {
  return {
    status: 'disabled',
    detail: `${provider} is disabled`,
    checked_at: new Date().toISOString()
  }
}

export async function up(knex) {
  const hasAiSettings = await knex.schema.hasTable('ai_settings')
  if (!hasAiSettings) {
    await knex.schema.createTable('ai_settings', (table) => {
      table.string('key').primary()
      table.text('value').nullable()
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    })
  }

  const hasProviderConfigs = await knex.schema.hasTable('ai_provider_configs')
  if (!hasProviderConfigs) {
    await knex.schema.createTable('ai_provider_configs', (table) => {
      table.string('id').primary()
      table.string('provider').notNullable().unique()
      table.boolean('enabled').notNullable().defaultTo(false)
      table.string('display_name').notNullable()
      table.string('base_url').nullable()
      table.string('default_model').nullable()
      table.jsonb('capabilities').nullable()
      table.jsonb('last_check_status').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    })
  }

  const hasProviderSecrets = await knex.schema.hasTable('ai_provider_secrets')
  if (!hasProviderSecrets) {
    await knex.schema.createTable('ai_provider_secrets', (table) => {
      table.string('id').primary()
      table.string('provider').notNullable().unique()
      table.text('encrypted_secret').notNullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    })
  }

  for (const [key, value] of SETTING_SEEDS) {
    const existing = await knex('ai_settings').where({ key }).first()
    if (!existing) {
      await knex('ai_settings').insert({
        key,
        value,
        updated_at: knex.fn.now()
      })
    }
  }

  for (const seed of PROVIDER_SEEDS) {
    const existing = await knex('ai_provider_configs').where({ provider: seed.provider }).first()
    const payload = {
      enabled: existing?.enabled ?? false,
      display_name: existing?.display_name ?? seed.displayName,
      base_url: existing?.base_url ?? seed.baseUrl,
      default_model: existing?.default_model ?? null,
      capabilities: existing?.capabilities ?? seed.capabilities,
      last_check_status: existing?.last_check_status ?? createDisabledStatus(seed.provider),
      updated_at: knex.fn.now()
    }

    if (!existing) {
      await knex('ai_provider_configs').insert({
        id: createId(),
        provider: seed.provider,
        created_at: knex.fn.now(),
        ...payload
      })
      continue
    }

    await knex('ai_provider_configs').where({ provider: seed.provider }).update(payload)
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ai_provider_secrets')
  await knex.schema.dropTableIfExists('ai_provider_configs')
  await knex.schema.dropTableIfExists('ai_settings')
}
