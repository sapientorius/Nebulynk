export async function up(knex) {
  await knex.schema.createTable('meeting_questions', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.text('question').notNullable()
    table.text('answer').notNullable()
    table.string('language').nullable()
    table.jsonb('citations').notNullable().defaultTo(knex.raw("'[]'::jsonb"))
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['meeting_id', 'user_id', 'created_at'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_questions')
}
