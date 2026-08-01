export async function up(knex) {
  await knex.schema.createTable('notifications', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('type').notNullable() // 'mention' | 'mention_all'
    table.string('message_id').nullable().references('id').inTable('messages').onDelete('SET NULL')
    table.string('channel_id').nullable().references('id').inTable('channels').onDelete('SET NULL')
    table.string('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('actor_display_name')
    table.text('message_snippet')
    table.boolean('is_read').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'is_read'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('notifications')
}
