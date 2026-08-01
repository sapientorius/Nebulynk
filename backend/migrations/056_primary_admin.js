export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.boolean('is_primary_admin').notNullable().defaultTo(false)
  })

  const primaryAdmin = await knex('users')
    .where({ is_admin: true })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .first()

  if (primaryAdmin) {
    await knex('users')
      .where('id', primaryAdmin.id)
      .update({ is_primary_admin: true })
  }

  await knex.schema.raw('CREATE UNIQUE INDEX users_primary_admin_unique ON users (is_primary_admin) WHERE is_primary_admin = true')
}

export async function down(knex) {
  await knex.schema.raw('DROP INDEX IF EXISTS users_primary_admin_unique')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_primary_admin')
  })
}
