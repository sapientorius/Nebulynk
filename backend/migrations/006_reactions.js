export async function up(knex) {
  await knex.schema.createTable('reactions', (table) => {
    table.string('id').primary()
    table.string('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('emoji').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['message_id', 'user_id', 'emoji'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('reactions')
}
