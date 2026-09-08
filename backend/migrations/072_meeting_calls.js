export async function up(knex) {
  await knex.schema.createTable('meeting_calls', table => {
    table.string('id').primary()
    table.string('source_channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('caller_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('title', 120)
    table.string('status').notNullable().defaultTo('ringing')
    table.string('meeting_id').references('id').inTable('meetings').onDelete('SET NULL')
    table.timestamp('expires_at').notNullable()
    table.boolean('expiry_processed').notNullable().defaultTo(false)
    table.timestamp('created_at').notNullable()
    table.timestamp('updated_at').notNullable()
    table.index(['status', 'expires_at'])
  })
  await knex.raw("CREATE UNIQUE INDEX meeting_calls_one_ringing ON meeting_calls (source_channel_id) WHERE status = 'ringing'")
  await knex.raw('CREATE INDEX meeting_calls_pending_expiry ON meeting_calls (expires_at) WHERE expiry_processed = false')
  await knex.schema.createTable('meeting_call_recipients', table => {
    table.string('call_id').notNullable().references('id').inTable('meeting_calls').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('status').notNullable().defaultTo('invited')
    table.primary(['call_id', 'user_id'])
    table.index(['user_id', 'status'])
  })
  await knex.schema.alterTable('messages', table => {
    table.string('call_id').unique().references('id').inTable('meeting_calls').onDelete('SET NULL')
    table.string('call_outcome')
  })
  await knex.schema.alterTable('notifications', table => {
    table.string('call_id').references('id').inTable('meeting_calls').onDelete('CASCADE')
    table.unique(['call_id', 'user_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('notifications', table => { table.dropColumn('call_id') })
  await knex.schema.alterTable('messages', table => { table.dropColumn('call_id'); table.dropColumn('call_outcome') })
  await knex.schema.dropTable('meeting_call_recipients')
  await knex.schema.dropTable('meeting_calls')
}
