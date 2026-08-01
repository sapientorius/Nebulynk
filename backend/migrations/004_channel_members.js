export async function up(knex) {
  await knex.schema.createTable('channel_members', (table) => {
    table.string('id').primary()
    table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.enum('role', ['owner', 'admin', 'member']).defaultTo('member')
    table.timestamp('last_read_at')
    table.enum('notifications', ['all', 'mentions', 'none']).defaultTo('all')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['channel_id', 'user_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('channel_members')
}
