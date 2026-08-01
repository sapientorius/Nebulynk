const DEFAULT_MEETING_VIDEO_PREFERENCES = {
  background_mode: 'none',
  preferred_camera_device_id: null
}

const DEFAULT_MEETING_VIDEO_PREFERENCES_SQL = `'${JSON.stringify(DEFAULT_MEETING_VIDEO_PREFERENCES)}'::jsonb`

export async function up(knex) {
  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')

  if (!hasMeetingVideoPreferences) {
    await knex.schema.alterTable('users', (table) => {
      table
        .jsonb('meeting_video_preferences')
        .notNullable()
        .defaultTo(knex.raw(DEFAULT_MEETING_VIDEO_PREFERENCES_SQL))
    })
  }

  await knex('users')
    .whereNull('meeting_video_preferences')
    .update({
      meeting_video_preferences: knex.raw(DEFAULT_MEETING_VIDEO_PREFERENCES_SQL)
    })
}

export async function down(knex) {
  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')

  if (hasMeetingVideoPreferences) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('meeting_video_preferences')
    })
  }
}
