const DEFAULT_LOCALE = 'en'

export async function up(knex) {
  const hasPreferredLocale = await knex.schema.hasColumn('users', 'preferred_locale')
  if (!hasPreferredLocale) {
    await knex.schema.alterTable('users', (table) => {
      table.string('preferred_locale', 10).notNullable().defaultTo(DEFAULT_LOCALE)
    })
  }

  const localeSetting = await knex('platform_settings').where('key', 'default_locale').first()
  if (!localeSetting) {
    await knex('platform_settings').insert({ key: 'default_locale', value: DEFAULT_LOCALE })
  } else if (!localeSetting.value) {
    await knex('platform_settings').where('key', 'default_locale').update({ value: DEFAULT_LOCALE })
  }
}

export async function down(knex) {
  const hasPreferredLocale = await knex.schema.hasColumn('users', 'preferred_locale')
  if (hasPreferredLocale) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('preferred_locale')
    })
  }

  await knex('platform_settings').where('key', 'default_locale').delete()
}
