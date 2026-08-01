export async function up(knex) {
  await knex.schema.createTable('meeting_recordings', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('participant_identity').notNullable()
    table.string('participant_display_name').nullable()
    table.string('status').notNullable().defaultTo('pending')
    table.string('livekit_egress_id').nullable()
    table.string('storage_bucket').nullable()
    table.string('storage_key').nullable()
    table.string('mime_type').nullable()
    table.bigInteger('duration_ms').nullable()
    table.timestamp('started_at').nullable()
    table.timestamp('ended_at').nullable()
    table.string('failure_code').nullable()
    table.text('failure_message').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['meeting_id', 'status'])
    table.index(['meeting_id', 'user_id'])
    table.index(['livekit_egress_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_recordings')
}
