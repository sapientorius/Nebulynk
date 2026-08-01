export async function up(knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS channels_notes_self_dm_unique
    ON channels (created_by)
    WHERE type = 'dm' AND name = 'notes'
  `)
}

export async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS channels_notes_self_dm_unique')
}
