import {
  DEFAULT_MEETING_LANGUAGE,
  normalizeMeetingLanguage
} from '../src/lib/meeting-languages.js'

export async function up(knex) {
  const defaultLocaleRow = await knex('platform_settings').where('key', 'default_locale').first()
  const platformDefaultMeetingLanguage = normalizeMeetingLanguage(
    defaultLocaleRow?.value,
    DEFAULT_MEETING_LANGUAGE
  )

  const defaultMeetingLanguageRow = await knex('platform_settings')
    .where('key', 'default_meeting_language')
    .first()

  if (!defaultMeetingLanguageRow) {
    await knex('platform_settings').insert({
      key: 'default_meeting_language',
      value: platformDefaultMeetingLanguage
    })
  } else if (!defaultMeetingLanguageRow.value) {
    await knex('platform_settings')
      .where('key', 'default_meeting_language')
      .update({ value: platformDefaultMeetingLanguage })
  }

  const hasLanguageColumn = await knex.schema.hasColumn('meetings', 'language')
  if (!hasLanguageColumn) {
    await knex.schema.alterTable('meetings', (table) => {
      table.string('language', 10).nullable()
    })
  }

  await knex('meetings')
    .whereNull('language')
    .update({ language: platformDefaultMeetingLanguage })

  await knex.schema.alterTable('meetings', (table) => {
    table.string('language', 10).notNullable().alter()
    table.index(['language'])
  })
}

export async function down(knex) {
  const hasLanguageColumn = await knex.schema.hasColumn('meetings', 'language')
  if (hasLanguageColumn) {
    await knex.schema.alterTable('meetings', (table) => {
      table.dropIndex(['language'])
      table.dropColumn('language')
    })
  }

  await knex('platform_settings').where('key', 'default_meeting_language').delete()
}
