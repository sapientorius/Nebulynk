const FUNCTION_KEYS = ['transcription', 'meeting_summary']

export async function up(knex) {
  await knex.schema.createTable('ai_provider_instances', (table) => {
    table.string('id').primary()
    table.string('provider_type').notNullable()
    table.string('display_name').notNullable()
    table.boolean('enabled').notNullable().defaultTo(true)
    table.string('base_url').nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table.index(['provider_type'])
  })

  await knex.schema.createTable('ai_provider_secrets', (table) => {
    table.string('provider_instance_id').primary()
    table.text('encrypted_secret').notNullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table
      .foreign('provider_instance_id')
      .references('ai_provider_instances.id')
      .onDelete('CASCADE')
  })

  await knex.schema.createTable('ai_provider_model_cache', (table) => {
    table.string('id').primary()
    table.string('provider_instance_id').notNullable()
    table.string('capability').notNullable()
    table.jsonb('models').notNullable()
    table.timestamp('fetched_at', { useTz: true }).notNullable()
    table.timestamp('expires_at', { useTz: true }).notNullable()
    table.string('last_fetch_status').nullable()
    table.text('last_fetch_error').nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table
      .foreign('provider_instance_id')
      .references('ai_provider_instances.id')
      .onDelete('CASCADE')
    table.unique(['provider_instance_id', 'capability'], {
      indexName: 'ai_provider_model_cache_provider_instance_id_capability_unique'
    })
  })

  await knex.schema.createTable('ai_function_configs', (table) => {
    table.string('function_key').primary()
    table.boolean('enabled').notNullable().defaultTo(false)
    table.string('provider_instance_id').nullable()
    table.string('model').nullable()
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table
      .foreign('provider_instance_id')
      .references('ai_provider_instances.id')
      .onDelete('SET NULL')
  })

  for (const functionKey of FUNCTION_KEYS) {
    await knex('ai_function_configs').insert({
      function_key: functionKey,
      enabled: false,
      provider_instance_id: null,
      model: null,
      updated_at: knex.fn.now()
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ai_function_configs')
  await knex.schema.dropTableIfExists('ai_provider_model_cache')
  await knex.schema.dropTableIfExists('ai_provider_secrets')
  await knex.schema.dropTableIfExists('ai_provider_instances')
}
