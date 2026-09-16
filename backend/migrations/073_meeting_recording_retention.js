const RETENTION_KEY = 'meeting_recording_retention_days'
const STORAGE_LIMIT_KEY = 'meeting_recording_storage_limit_gib'

async function insertMissingSetting(knex, key, value) {
  const existing = await knex('platform_settings').where('key', key).first()
  if (!existing) await knex('platform_settings').insert({ key, value })
}

export async function up(knex) {
  await insertMissingSetting(knex, RETENTION_KEY, '60')
  await insertMissingSetting(knex, STORAGE_LIMIT_KEY, 'unlimited')

  const hasSizeColumn = await knex.schema.hasColumn('meeting_recordings', 'storage_size_bytes')
  if (!hasSizeColumn) {
    await knex.schema.alterTable('meeting_recordings', (table) => {
      table.bigInteger('storage_size_bytes').nullable()
    })
  }
}

export async function down(knex) {
  const hasSizeColumn = await knex.schema.hasColumn('meeting_recordings', 'storage_size_bytes')
  if (hasSizeColumn) {
    await knex.schema.alterTable('meeting_recordings', (table) => {
      table.dropColumn('storage_size_bytes')
    })
  }

  await knex('platform_settings')
    .whereIn('key', [RETENTION_KEY, STORAGE_LIMIT_KEY])
    .delete()
}
