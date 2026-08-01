export async function up(knex) {
  await knex.schema.createTable('auth_sessions', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('refresh_token_hash').notNullable().unique()
    table.string('transport').notNullable()
    table.boolean('is_persistent').notNullable().defaultTo(false)
    table.timestamp('expires_at').notNullable()
    table.timestamp('last_used_at').nullable()
    table.timestamp('revoked_at').nullable()
    table.string('created_ip').nullable()
    table.string('last_used_ip').nullable()
    table.string('user_agent').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'revoked_at'], 'auth_sessions_user_revoked_idx')
    table.index(['expires_at', 'revoked_at'], 'auth_sessions_expires_revoked_idx')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('auth_sessions')
}
