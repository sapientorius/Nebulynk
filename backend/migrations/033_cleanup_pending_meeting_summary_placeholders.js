const LEGACY_ARTIFACT_TYPES = ['summary', 'actions']

export async function up(knex) {
  await knex('meeting_artifacts')
    .whereIn('artifact_type', LEGACY_ARTIFACT_TYPES)
    .where('status', 'pending')
    .whereNull('payload')
    .del()
}

export async function down() {
  // No-op: deleted placeholder rows cannot be reconstructed safely.
}
