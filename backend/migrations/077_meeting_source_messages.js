export async function up(knex) {
  await knex.schema.alterTable('meetings', table => {
    table.timestamp('source_message_pending_at').nullable()
  })
  await knex.raw(`CREATE INDEX meetings_source_message_pending_idx
    ON meetings (source_message_pending_at, id)
    WHERE source_message_pending_at IS NOT NULL`)
}

export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS meetings_source_message_pending_idx')
  await knex.schema.alterTable('meetings', table => {
    table.dropColumn('source_message_pending_at')
  })
}
