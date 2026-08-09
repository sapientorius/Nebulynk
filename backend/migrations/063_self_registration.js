export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('registration_status').notNullable().defaultTo('active')
    table.timestamp('email_verified_at').nullable()
    table.index(['registration_status'], 'users_registration_status_idx')
  })

  await knex.schema.createTable('registration_email_tokens', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('token_hash').notNullable().unique()
    table.timestamp('expires_at').notNullable()
    table.timestamp('consumed_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'consumed_at'], 'registration_email_tokens_user_consumed_idx')
    table.index(['expires_at', 'consumed_at'], 'registration_email_tokens_expiry_consumed_idx')
  })

  await knex('platform_settings').insert([
    { key: 'self_registration_enabled', value: 'false' },
    { key: 'self_registration_allowed_domains', value: '[]' },
    { key: 'self_registration_requires_admin_approval', value: 'false' },
    { key: 'password_strength_level', value: 'basic' }
  ])
}

export async function down(knex) {
  await knex('platform_settings')
    .whereIn('key', [
      'self_registration_enabled',
      'self_registration_allowed_domains',
      'self_registration_requires_admin_approval',
      'password_strength_level'
    ])
    .del()

  await knex.schema.dropTableIfExists('registration_email_tokens')

  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['registration_status'], 'users_registration_status_idx')
    table.dropColumn('email_verified_at')
    table.dropColumn('registration_status')
  })
}
