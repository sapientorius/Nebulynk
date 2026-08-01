export async function up(knex) {
  await knex.schema.alterTable('channels', (table) => {
    table.boolean('is_archived').notNullable().defaultTo(false)
    table.timestamp('archived_at').nullable()
    table.string('archived_by').nullable().references('id').inTable('users').onDelete('SET NULL')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('channels', (table) => {
    table.dropColumn('archived_by')
    table.dropColumn('archived_at')
    table.dropColumn('is_archived')
  })
}
