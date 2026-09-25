export async function up(knex) {
  await knex.schema.alterTable('ai_function_configs', (table) => {
    table.jsonb('request_profile').nullable()
    table.timestamp('verified_at', { useTz: true }).nullable()
    table.string('verification_fingerprint', 64).nullable()
    table.text('verification_error').nullable()
  })
}

export async function down(knex) {
  await knex.schema.alterTable('ai_function_configs', (table) => {
    table.dropColumn('request_profile')
    table.dropColumn('verified_at')
    table.dropColumn('verification_fingerprint')
    table.dropColumn('verification_error')
  })
}
