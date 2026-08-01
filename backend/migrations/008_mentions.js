export async function up(knex) {
  await knex.schema.createTable('mentions', (table) => {
    table.string('id').primary()
    table.string('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE')
    table.string('user_id').references('id').inTable('users').onDelete('CASCADE')
    table.enum('type', ['user', 'channel', 'all']).notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('mentions')
}
