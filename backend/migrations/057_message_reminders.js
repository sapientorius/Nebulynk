const MESSAGE_REMINDERS_ACTIVE_UNIQUE = 'message_reminders_user_message_active_uidx'
const MESSAGE_REMINDERS_DUE_INDEX = 'message_reminders_status_remind_at_idx'
const MESSAGE_REMINDERS_USER_MESSAGE_INDEX = 'message_reminders_user_message_idx'

export async function up(knex) {
  await knex.schema.createTable('message_reminders', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE')
    table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.timestamp('remind_at').notNullable()
    table.string('status').notNullable().defaultTo('active')
    table.string('notification_id').nullable().references('id').inTable('notifications').onDelete('SET NULL')
    table.timestamp('delivered_at').nullable()
    table.timestamp('cancelled_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['status', 'remind_at'], MESSAGE_REMINDERS_DUE_INDEX)
    table.index(['user_id', 'message_id'], MESSAGE_REMINDERS_USER_MESSAGE_INDEX)
  })

  await knex.raw(
    `CREATE UNIQUE INDEX ${MESSAGE_REMINDERS_ACTIVE_UNIQUE} ON message_reminders (user_id, message_id) WHERE status = 'active'`
  )
}

export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ${MESSAGE_REMINDERS_ACTIVE_UNIQUE}`)
  await knex.schema.dropTableIfExists('message_reminders')
}
