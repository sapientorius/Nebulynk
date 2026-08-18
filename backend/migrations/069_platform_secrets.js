export async function up(knex) {
  await knex.schema.createTable('platform_secrets', (table) => {
    table.string('key').primary()
    table.text('encrypted_value').notNullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_secrets')
}
