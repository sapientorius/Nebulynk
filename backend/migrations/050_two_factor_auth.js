export async function up(knex) {
  await knex.schema.createTable('user_two_factor', (table) => {
    table.string('user_id').primary().references('id').inTable('users').onDelete('CASCADE')
    table.string('method').notNullable().defaultTo('totp')
    table.text('encrypted_secret').notNullable()
    table.timestamp('enabled_at').notNullable()
    table.timestamp('last_used_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('user_two_factor_pending', (table) => {
    table.string('user_id').primary().references('id').inTable('users').onDelete('CASCADE')
    table.text('encrypted_secret').notNullable()
    table.timestamp('expires_at').notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.index(['expires_at'], 'user_two_factor_pending_expires_idx')
  })

  await knex.schema.createTable('user_two_factor_recovery_codes', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('code_hash').notNullable()
    table.timestamp('used_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['code_hash'], {
      indexName: 'user_two_factor_recovery_codes_hash_unique'
    })
    table.index(['user_id', 'used_at'], 'user_two_factor_recovery_codes_user_used_idx')
  })

  await knex.schema.createTable('auth_login_challenges', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.boolean('remember').notNullable().defaultTo(false)
    table.timestamp('expires_at').notNullable()
    table.integer('attempt_count').notNullable().defaultTo(0)
    table.timestamp('consumed_at').nullable()
    table.string('created_ip').nullable()
    table.string('user_agent').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'consumed_at'], 'auth_login_challenges_user_consumed_idx')
    table.index(['expires_at', 'consumed_at'], 'auth_login_challenges_expires_consumed_idx')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('auth_login_challenges')
  await knex.schema.dropTableIfExists('user_two_factor_recovery_codes')
  await knex.schema.dropTableIfExists('user_two_factor_pending')
  await knex.schema.dropTableIfExists('user_two_factor')
}
