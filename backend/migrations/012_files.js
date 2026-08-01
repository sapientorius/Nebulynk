export async function up(knex) {
  await knex.schema.createTable('files', (table) => {
    table.string('id').primary()
    table.string('message_id').references('id').inTable('messages').onDelete('SET NULL')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('original_name').notNullable()
    table.string('storage_key').notNullable()
    table.string('mime_type').notNullable()
    table.integer('size').notNullable()
    table.string('bucket').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['message_id'])
    table.index(['user_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('files')
}
