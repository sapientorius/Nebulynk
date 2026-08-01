export async function up(knex) {
  await knex.schema.createTable('pinned_messages', (table) => {
    table.string('id').primary()
    table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE')
    table.string('pinned_by').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['channel_id', 'message_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('pinned_messages')
}
