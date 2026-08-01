export async function up(knex) {
  await knex.schema.alterTable('channels', (table) => {
    table.enum('purpose', ['default', 'meeting']).notNullable().defaultTo('default')
  })

  await knex.schema.createTable('meetings', (table) => {
    table.string('id').primary()
    table.string('title').nullable()
    table.string('status').notNullable().defaultTo('active')
    table.string('source_channel_id').nullable().references('id').inTable('channels').onDelete('SET NULL')
    table.string('chat_channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('host_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('started_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('ended_at').nullable()
    table.string('ended_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['status'])
    table.index(['host_user_id'])
    table.index(['source_channel_id'])
  })

  await knex.schema.createTable('meeting_participants', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.enum('role', ['host', 'participant']).notNullable().defaultTo('participant')
    table.enum('invite_status', ['invited', 'joined', 'left']).notNullable().defaultTo('invited')
    table.timestamp('invited_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('joined_at').nullable()
    table.timestamp('left_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['meeting_id', 'user_id'])
    table.index(['meeting_id', 'invite_status'])
    table.index(['user_id'])
  })

  await knex.schema.createTable('meeting_artifacts', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.enum('artifact_type', ['transcript', 'summary', 'actions']).notNullable()
    table.enum('status', ['pending', 'processing', 'ready', 'failed']).notNullable().defaultTo('pending')
    table.jsonb('payload').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.unique(['meeting_id', 'artifact_type'])
    table.index(['meeting_id'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_artifacts')
  await knex.schema.dropTableIfExists('meeting_participants')
  await knex.schema.dropTableIfExists('meetings')

  await knex.schema.alterTable('channels', (table) => {
    table.dropColumn('purpose')
  })
}
