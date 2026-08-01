export async function up(knex) {
  await knex.schema.alterTable('messages', (table) => {
    table.string('reply_to_message_id').nullable().references('id').inTable('messages').onDelete('SET NULL')
    table.string('forward_source_message_id').nullable().references('id').inTable('messages').onDelete('SET NULL')
    table.string('forward_source_channel_id').nullable().references('id').inTable('channels').onDelete('SET NULL')
    table.jsonb('forward_source_snapshot').nullable()

    table.index(['reply_to_message_id'])
    table.index(['forward_source_message_id'])
    table.index(['forward_source_channel_id'])
  })
}

export async function down(knex) {
  await knex.schema.alterTable('messages', (table) => {
    table.dropIndex(['forward_source_channel_id'])
    table.dropIndex(['forward_source_message_id'])
    table.dropIndex(['reply_to_message_id'])
    table.dropColumn('forward_source_snapshot')
    table.dropColumn('forward_source_channel_id')
    table.dropColumn('forward_source_message_id')
    table.dropColumn('reply_to_message_id')
  })
}
