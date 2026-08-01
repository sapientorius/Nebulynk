export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('avatar_storage_key')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('avatar_storage_key')
  })
}
