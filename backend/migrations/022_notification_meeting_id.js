export async function up(knex) {
  await knex.schema.alterTable('notifications', (table) => {
    table.string('meeting_id').nullable().references('id').inTable('meetings').onDelete('SET NULL')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('notifications', (table) => {
    table.dropColumn('meeting_id')
  })
}
