export async function up(knex) {
  const hasChatSummaryConfig = await knex('ai_function_configs')
    .where('function_key', 'chat_summary')
    .first()

  if (!hasChatSummaryConfig) {
    const meetingSummaryConfig = await knex('ai_function_configs')
      .where('function_key', 'meeting_summary')
      .first()

    await knex('ai_function_configs').insert({
      function_key: 'chat_summary',
      enabled: meetingSummaryConfig?.enabled || false,
      provider_instance_id: meetingSummaryConfig?.provider_instance_id || null,
      model: meetingSummaryConfig?.model || null,
      updated_at: knex.fn.now()
    })
  }

  const hasMessageSummaries = await knex.schema.hasTable('message_summaries')
  if (!hasMessageSummaries) {
    await knex.schema.createTable('message_summaries', (table) => {
      table.string('id').primary()
      table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('scope').notNullable()
      table.string('status').notNullable().defaultTo('processing')
      table.text('summary').nullable()
      table.jsonb('payload').nullable()
      table.jsonb('source_message_ids').notNullable().defaultTo(knex.raw("'[]'::jsonb"))
      table.timestamp('source_started_at', { useTz: true }).nullable()
      table.timestamp('source_ended_at', { useTz: true }).nullable()
      table.integer('message_count').notNullable().defaultTo(0)
      table.string('failure_code').nullable()
      table.text('failure_message').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

      table.index(['channel_id', 'user_id', 'created_at'])
      table.index(['user_id', 'status'])
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('message_summaries')
  await knex('ai_function_configs').where('function_key', 'chat_summary').delete()
}
