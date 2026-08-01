export async function up(knex) {
  await knex.schema.createTable('channels', (table) => {
    table.string('id').primary()
    table.string('name').notNullable()
    table.text('description')
    table.text('topic')
    table.enum('type', ['public', 'private', 'dm', 'group']).defaultTo('public')
    table.string('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('channels')
}
