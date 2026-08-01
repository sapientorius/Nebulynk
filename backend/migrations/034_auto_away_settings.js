const DEFAULT_AUTO_AWAY_MINUTES = '15'

export async function up(knex) {
  const existing = await knex('platform_settings').where('key', 'auto_away_minutes').first()

  if (!existing) {
    await knex('platform_settings').insert({
      key: 'auto_away_minutes',
      value: DEFAULT_AUTO_AWAY_MINUTES
    })
    return
  }

  const parsed = Number.parseInt(existing.value, 10)
  if (Number.isNaN(parsed) || parsed < 1) {
    await knex('platform_settings')
      .where('key', 'auto_away_minutes')
      .update({ value: DEFAULT_AUTO_AWAY_MINUTES })
  }
}

export async function down(knex) {
  await knex('platform_settings').where('key', 'auto_away_minutes').delete()
}
