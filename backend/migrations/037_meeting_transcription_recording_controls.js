export async function up(knex) {
  await knex.schema.alterTable('meetings', (table) => {
    table.string('transcription_recording_status').notNullable().defaultTo('active')
    table.timestamp('transcription_recording_paused_at').nullable()
    table.string('transcription_recording_paused_by').nullable().references('id').inTable('users').onDelete('SET NULL')

    table.index(['transcription_recording_status'])
  })

  await knex.schema.createTable('meeting_recording_pauses', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('paused_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('resumed_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('paused_at').notNullable()
    table.timestamp('resumed_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['meeting_id', 'paused_at'])
    table.index(['meeting_id', 'resumed_at'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_recording_pauses')

  await knex.schema.alterTable('meetings', (table) => {
    table.dropIndex(['transcription_recording_status'])
    table.dropColumn('transcription_recording_paused_by')
    table.dropColumn('transcription_recording_paused_at')
    table.dropColumn('transcription_recording_status')
  })
}
