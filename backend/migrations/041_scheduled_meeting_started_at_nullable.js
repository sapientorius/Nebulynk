export async function up(knex) {
  await knex.raw('ALTER TABLE meetings ALTER COLUMN started_at DROP NOT NULL')
}

export async function down(knex) {
  await knex.raw(`
    UPDATE meetings
    SET started_at = COALESCE(started_at, scheduled_start_at, created_at, NOW())
    WHERE started_at IS NULL
  `)
  await knex.raw('ALTER TABLE meetings ALTER COLUMN started_at SET NOT NULL')
}
