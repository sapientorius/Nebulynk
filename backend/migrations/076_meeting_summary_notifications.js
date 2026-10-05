export async function up(knex) {
  await knex.schema.alterTable('meeting_artifacts', table => {
    table.timestamp('summary_ready_notified_at').nullable()
  })
  // Revisions can exist while a formerly ready summary is being regenerated.
  // Those meetings must not receive a historical completion notification.
  await knex.raw(`
    UPDATE meeting_artifacts AS artifact
    SET summary_ready_notified_at = COALESCE(artifact.updated_at, NOW())
    WHERE artifact.artifact_type = 'summary'
      AND (artifact.status = 'ready' OR EXISTS (
        SELECT 1 FROM meeting_summary_revisions AS revision
        WHERE revision.meeting_id = artifact.meeting_id
      ))
  `)
}

export async function down(knex) {
  await knex.schema.alterTable('meeting_artifacts', table => {
    table.dropColumn('summary_ready_notified_at')
  })
}
