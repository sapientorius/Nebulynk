import { createId } from '@paralleldrive/cuid2'

const DEFAULT_MEETING_VIDEO_PREFERENCES = {
  background_mode: 'none',
  preferred_camera_device_id: null,
  background_image_id: null
}

const PREVIOUS_MEETING_VIDEO_PREFERENCES = {
  background_mode: 'none',
  preferred_camera_device_id: null
}

function jsonbDefault(knex, value) {
  return knex.raw(`'${JSON.stringify(value)}'::jsonb`)
}

function jsonbDefaultSql(value) {
  return `'${JSON.stringify(value)}'::jsonb`
}

async function ensurePermission(knex) {
  let permission = await knex('permissions').where('name', 'manage_video_backgrounds').first()
  if (!permission) {
    permission = {
      id: createId(),
      name: 'manage_video_backgrounds',
      description: 'Video-Hintergruende global verwalten',
      category: 'video'
    }
    await knex('permissions').insert(permission)
  }

  const roles = await knex('roles')
    .whereIn('name', ['platform:admin', 'platform:moderator'])
    .select('id')

  for (const role of roles) {
    const existing = await knex('role_permissions')
      .where({ role_id: role.id, permission_id: permission.id })
      .first()
    if (!existing) {
      await knex('role_permissions').insert({
        id: createId(),
        role_id: role.id,
        permission_id: permission.id
      })
    }
  }
}

async function ensureAiFunctionConfig(knex) {
  const hasAiFunctionConfigs = await knex.schema.hasTable('ai_function_configs')
  if (!hasAiFunctionConfigs) return

  const existing = await knex('ai_function_configs')
    .where('function_key', 'image_generation')
    .first()
  if (existing) return

  const now = new Date().toISOString()
  await knex('ai_function_configs').insert({
    function_key: 'image_generation',
    enabled: false,
    provider_instance_id: null,
    model: null,
    updated_at: now
  })
}

export async function up(knex) {
  const hasVideoBackgrounds = await knex.schema.hasTable('video_backgrounds')
  if (!hasVideoBackgrounds) {
    await knex.schema.createTable('video_backgrounds', (table) => {
      table.string('id').primary()
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('title', 120).nullable()
      table.enum('source', ['upload', 'generated']).notNullable()
      table.boolean('is_global').notNullable().defaultTo(false)
      table.text('prompt').nullable()
      table.string('storage_key').notNullable()
      table.string('bucket').notNullable()
      table.string('mime_type').notNullable()
      table.integer('size').notNullable()
      table.integer('width').notNullable()
      table.integer('height').notNullable()
      table.string('published_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.timestamp('published_at').nullable()
      table.timestamp('created_at').defaultTo(knex.fn.now())
      table.timestamp('updated_at').defaultTo(knex.fn.now())
      table.index(['user_id', 'created_at'])
      table.index(['is_global', 'created_at'])
    })
  }

  await ensurePermission(knex)
  await ensureAiFunctionConfig(knex)

  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')
  if (hasMeetingVideoPreferences) {
    await knex.raw(
      `ALTER TABLE users ALTER COLUMN meeting_video_preferences SET DEFAULT ${jsonbDefaultSql(DEFAULT_MEETING_VIDEO_PREFERENCES)}`
    )
    await knex.raw(
      "UPDATE users SET meeting_video_preferences = ? || COALESCE(meeting_video_preferences, '{}'::jsonb)",
      [jsonbDefault(knex, DEFAULT_MEETING_VIDEO_PREFERENCES)]
    )
  }
}

export async function down(knex) {
  const permission = await knex('permissions').where('name', 'manage_video_backgrounds').first()
  if (permission) {
    await knex('role_permissions').where('permission_id', permission.id).delete()
    await knex('permissions').where('id', permission.id).delete()
  }

  const hasMeetingVideoPreferences = await knex.schema.hasColumn('users', 'meeting_video_preferences')
  if (hasMeetingVideoPreferences) {
    await knex.raw(
      `ALTER TABLE users ALTER COLUMN meeting_video_preferences SET DEFAULT ${jsonbDefaultSql(PREVIOUS_MEETING_VIDEO_PREFERENCES)}`
    )
    await knex.raw(`
      UPDATE users
      SET meeting_video_preferences = jsonb_set(
        meeting_video_preferences - 'background_image_id',
        '{background_mode}',
        '"none"'::jsonb
      )
      WHERE meeting_video_preferences->>'background_mode' = 'image'
    `)
    await knex.raw(
      "UPDATE users SET meeting_video_preferences = meeting_video_preferences - 'background_image_id'"
    )
  }

  const hasVideoBackgrounds = await knex.schema.hasTable('video_backgrounds')
  if (hasVideoBackgrounds) {
    await knex.schema.dropTable('video_backgrounds')
  }

  const hasAiFunctionConfigs = await knex.schema.hasTable('ai_function_configs')
  if (hasAiFunctionConfigs) {
    await knex('ai_function_configs').where('function_key', 'image_generation').delete()
  }
}
