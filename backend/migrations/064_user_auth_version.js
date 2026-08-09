export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.integer('auth_version').notNullable().defaultTo(1)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('auth_version')
  })
}
