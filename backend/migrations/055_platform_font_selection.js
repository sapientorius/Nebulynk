import {
  DEFAULT_THEME_SETTINGS,
  THEME_SETTING_KEYS
} from '../src/lib/theme-settings.js'

async function upsertPlatformSetting(knex, key, value) {
  const existing = await knex('platform_settings').where('key', key).first()
  if (!existing) {
    await knex('platform_settings').insert({ key, value })
    return
  }
  if (!existing.value) {
    await knex('platform_settings').where('key', key).update({ value })
  }
}

export async function up(knex) {
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.fontFamily, DEFAULT_THEME_SETTINGS.fontFamily)
}

export async function down(knex) {
  await knex('platform_settings')
    .where('key', THEME_SETTING_KEYS.fontFamily)
    .delete()
}
