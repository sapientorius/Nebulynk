export async function up(knex) {
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.text('endpoint').notNullable()
    table.text('p256dh').notNullable()
    table.text('auth').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['endpoint'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('push_subscriptions')
}
