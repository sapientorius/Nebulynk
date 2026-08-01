async function insertMissingSetting(knex, key, value) {
  const existing = await knex('platform_settings').where('key', key).first()
  if (existing) return
  await knex('platform_settings').insert({ key, value })
}

export async function up(knex) {
  await insertMissingSetting(knex, 'meeting_video_enabled', 'true')

  const hasVideoEnabledColumn = await knex.schema.hasColumn('voice_participants', 'is_video_enabled')
  if (!hasVideoEnabledColumn) {
    await knex.schema.alterTable('voice_participants', (table) => {
      table.boolean('is_video_enabled').defaultTo(false)
    })
  }
}

export async function down(knex) {
  const hasVideoEnabledColumn = await knex.schema.hasColumn('voice_participants', 'is_video_enabled')
  if (hasVideoEnabledColumn) {
    await knex.schema.alterTable('voice_participants', (table) => {
      table.dropColumn('is_video_enabled')
    })
  }

  await knex('platform_settings')
    .where('key', 'meeting_video_enabled')
    .delete()
}
