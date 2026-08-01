export async function up(knex) {
  await knex.schema.dropTableIfExists('ai_provider_model_cache')
  await knex.schema.dropTableIfExists('ai_provider_secrets')
  await knex.schema.dropTableIfExists('ai_provider_instances')
  await knex.schema.dropTableIfExists('ai_provider_configs')
  await knex.schema.dropTableIfExists('ai_settings')
}

export async function down(knex) {
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
  if (!hasProviderSecrets) {
    await knex.schema.createTable('ai_provider_secrets', (table) => {
      table.string('id').primary()
      table.string('provider').notNullable().unique()
      table.text('encrypted_secret').notNullable()
      table.string('provider_instance_id').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    })
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
}
