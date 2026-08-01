export async function up(knex) {
  await knex.schema.alterTable('meetings', (table) => {
    table.timestamp('empty_since').nullable()
    table.index(['status', 'empty_since'], 'meetings_status_empty_since_idx')
  })
}

export async function down(knex) {
  await knex.schema.alterTable('meetings', (table) => {
    table.dropIndex(['status', 'empty_since'], 'meetings_status_empty_since_idx')
    table.dropColumn('empty_since')
  })
}
