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
  const hasThemePreference = await knex.schema.hasColumn('users', 'theme_preference')
  if (!hasThemePreference) {
    await knex.schema.alterTable('users', (table) => {
      table.string('theme_preference', 20).notNullable().defaultTo('platform')
    })
  }

  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.modeDefault, DEFAULT_THEME_SETTINGS.modeDefault)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.primaryColor, DEFAULT_THEME_SETTINGS.darkPrimaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.secondaryColor, DEFAULT_THEME_SETTINGS.darkSecondaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.successColor, DEFAULT_THEME_SETTINGS.darkSuccessColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.warningColor, DEFAULT_THEME_SETTINGS.darkWarningColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.errorColor, DEFAULT_THEME_SETTINGS.darkErrorColor)
}

export async function down(knex) {
  const hasThemePreference = await knex.schema.hasColumn('users', 'theme_preference')
  if (hasThemePreference) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('theme_preference')
    })
  }

  await knex('platform_settings')
    .whereIn('key', Object.values(THEME_SETTING_KEYS))
    .delete()
}
