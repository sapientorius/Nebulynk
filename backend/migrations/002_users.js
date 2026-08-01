export async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.string('id').primary()
    table.string('email').unique().notNullable()
    table.string('password').notNullable()
    table.string('display_name').notNullable()
    table.string('avatar_url')
    table.enum('status', ['online', 'away', 'dnd', 'offline']).defaultTo('offline')
    table.string('custom_status')
    table.string('custom_status_emoji')
    table.timestamp('status_expires_at')
    table.boolean('is_admin').defaultTo(false)
    table.boolean('is_verified').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('users')
}
