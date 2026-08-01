export async function up(knex) {
  await knex.schema.createTable('platform_settings', (table) => {
    table.string('key').primary()
    table.text('value')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  // Insert default settings
  await knex('platform_settings').insert([
    { key: 'initialized', value: 'false' },
    { key: 'platform_name', value: 'Nebulynk' },
    { key: 'domain', value: '' },
    { key: 'default_locale', value: 'en' }
  ])
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_settings')
}
