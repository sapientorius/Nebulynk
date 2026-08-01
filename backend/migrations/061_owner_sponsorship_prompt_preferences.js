export async function up(knex) {
  const exists = await knex.schema.hasTable('user_sponsorship_prompt_preferences')
  if (exists) return

  await knex.schema.createTable('user_sponsorship_prompt_preferences', (table) => {
    table.string('user_id').primary().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('last_shown_at').nullable()
    table.timestamp('disabled_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_sponsorship_prompt_preferences')
}
