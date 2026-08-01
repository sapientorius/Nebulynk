import {
  DEFAULT_THEME_SETTINGS,
  THEME_SETTING_KEYS
} from '../src/lib/theme-settings.js'

async function readSetting(knex, key, fallback) {
  const row = await knex('platform_settings').where('key', key).first()
  return row?.value || fallback
}

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
  const primaryColor = await readSetting(knex, THEME_SETTING_KEYS.primaryColor, DEFAULT_THEME_SETTINGS.darkPrimaryColor)
  const secondaryColor = await readSetting(knex, THEME_SETTING_KEYS.secondaryColor, DEFAULT_THEME_SETTINGS.darkSecondaryColor)
  const successColor = await readSetting(knex, THEME_SETTING_KEYS.successColor, DEFAULT_THEME_SETTINGS.darkSuccessColor)
  const warningColor = await readSetting(knex, THEME_SETTING_KEYS.warningColor, DEFAULT_THEME_SETTINGS.darkWarningColor)
  const errorColor = await readSetting(knex, THEME_SETTING_KEYS.errorColor, DEFAULT_THEME_SETTINGS.darkErrorColor)

  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkPrimaryColor, primaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkSecondaryColor, secondaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkSuccessColor, successColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkWarningColor, warningColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkErrorColor, errorColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightPrimaryColor, primaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightSecondaryColor, secondaryColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightSuccessColor, successColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightWarningColor, warningColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightErrorColor, errorColor)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.customCssGlobal, DEFAULT_THEME_SETTINGS.customCssGlobal)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.darkCustomCss, DEFAULT_THEME_SETTINGS.darkCustomCss)
  await upsertPlatformSetting(knex, THEME_SETTING_KEYS.lightCustomCss, DEFAULT_THEME_SETTINGS.lightCustomCss)
}

export async function down(knex) {
  await knex('platform_settings')
    .whereIn('key', [
      THEME_SETTING_KEYS.darkPrimaryColor,
      THEME_SETTING_KEYS.darkSecondaryColor,
      THEME_SETTING_KEYS.darkSuccessColor,
      THEME_SETTING_KEYS.darkWarningColor,
      THEME_SETTING_KEYS.darkErrorColor,
      THEME_SETTING_KEYS.lightPrimaryColor,
      THEME_SETTING_KEYS.lightSecondaryColor,
      THEME_SETTING_KEYS.lightSuccessColor,
      THEME_SETTING_KEYS.lightWarningColor,
      THEME_SETTING_KEYS.lightErrorColor,
      THEME_SETTING_KEYS.customCssGlobal,
      THEME_SETTING_KEYS.darkCustomCss,
      THEME_SETTING_KEYS.lightCustomCss
    ])
    .delete()
}
