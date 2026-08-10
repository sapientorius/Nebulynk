export async function up(knex) {
  await knex.schema.alterTable('smtp_settings', (table) => {
    table.boolean('admin_managed').notNullable().defaultTo(false)
  })

  const [settings, secrets] = await Promise.all([
    knex('smtp_settings').select('id', 'enabled', 'host', 'port', 'user', 'from_email', 'from_name'),
    knex('smtp_secrets').select('smtp_settings_id')
  ])
  const secretIds = new Set(secrets.map((secret) => secret.smtp_settings_id))
  const managedIds = settings
    .filter((setting) => (
      setting.enabled === true
      || setting.host
      || Number.isInteger(setting.port)
      || setting.user
      || setting.from_email
      || setting.from_name
      || secretIds.has(setting.id)
    ))
    .map((setting) => setting.id)

  if (managedIds.length > 0) {
    await knex('smtp_settings').whereIn('id', managedIds).update({ admin_managed: true })
  }
}

export async function down(knex) {
  await knex.schema.alterTable('smtp_settings', (table) => {
    table.dropColumn('admin_managed')
  })
}
