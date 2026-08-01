const DEFAULT_MEETING_VIDEO_PREFERENCES = {
  background_mode: 'none',
  preferred_camera_device_id: null,
  background_image_id: null,
  video_mirror: false
}

function jsonbDefault(knex, value) {
  return knex.raw(`'${JSON.stringify(value)}'::jsonb`)
}

function jsonbDefaultSql(value) {
  return `'${JSON.stringify(value)}'::jsonb`
}

export async function up(knex) {
  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')

  if (!hasMeetingVideoPreferences) {
    await knex.schema.alterTable('users', (table) => {
      table
        .jsonb('meeting_video_preferences')
        .notNullable()
        .defaultTo(jsonbDefault(knex, DEFAULT_MEETING_VIDEO_PREFERENCES))
    })
    return
  }

  await knex.raw(
    `ALTER TABLE users ALTER COLUMN meeting_video_preferences SET DEFAULT ${jsonbDefaultSql(DEFAULT_MEETING_VIDEO_PREFERENCES)}`
  )
  await knex.raw(
    "UPDATE users SET meeting_video_preferences = ?::jsonb || COALESCE(meeting_video_preferences, '{}'::jsonb)",
    [JSON.stringify({ video_mirror: false })]
  )
}

export async function down(knex) {
  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')
  if (!hasMeetingVideoPreferences) return

  await knex.raw(
    "UPDATE users SET meeting_video_preferences = meeting_video_preferences - 'video_mirror'"
  )
}
