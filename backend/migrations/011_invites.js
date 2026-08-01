export async function up(knex) {
  await knex.schema.createTable('invites', (table) => {
    table.string('id').primary()
    table.string('email').notNullable()
    table.string('token').unique().notNullable()
    table.string('invited_by').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('role_to_assign').defaultTo('platform:member')
    table.text('message')
    table.enum('status', ['pending', 'accepted', 'expired', 'revoked']).defaultTo('pending')
    table.string('accepted_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('expires_at')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index('token')
    table.index('email')
    table.index('status')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('invites')
}
