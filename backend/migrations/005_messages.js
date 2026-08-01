export async function up(knex) {
  await knex.schema.createTable('messages', (table) => {
    table.string('id').primary()
    table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.text('content').notNullable()
    table.enum('type', ['text', 'system', 'file']).defaultTo('text')
    table.timestamp('edited_at')
    table.timestamp('deleted_at')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['channel_id', 'created_at'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('messages')
}
