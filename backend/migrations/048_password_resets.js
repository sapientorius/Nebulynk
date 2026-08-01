export async function up(knex) {
  await knex.schema.createTable('password_resets', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('token_hash').notNullable().unique()
    table.timestamp('expires_at', { useTz: true }).notNullable()
    table.timestamp('used_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index(['user_id', 'used_at'], 'password_resets_user_used_idx')
    table.index(['expires_at', 'used_at'], 'password_resets_expires_used_idx')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('password_resets')
}
