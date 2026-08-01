const DEFAULT_SMTP_SETTINGS_ID = 'default'

export async function up(knex) {
  await knex.schema.createTable('smtp_settings', (table) => {
    table.string('id').primary()
    table.boolean('enabled').notNullable().defaultTo(false)
    table.string('host').nullable()
    table.integer('port').nullable()
    table.boolean('secure').notNullable().defaultTo(false)
    table.boolean('ignore_tls').notNullable().defaultTo(false)
    table.string('user').nullable()
    table.string('from_email').nullable()
    table.string('from_name').nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('smtp_secrets', (table) => {
    table.string('smtp_settings_id').primary()
    table.text('encrypted_password').notNullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table
      .foreign('smtp_settings_id')
      .references('smtp_settings.id')
      .onDelete('CASCADE')
  })

  await knex('smtp_settings').insert({
    id: DEFAULT_SMTP_SETTINGS_ID,
    enabled: false,
    host: null,
    port: null,
    secure: false,
    ignore_tls: false,
    user: null,
    from_email: null,
    from_name: null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('smtp_secrets')
  await knex.schema.dropTableIfExists('smtp_settings')
}
