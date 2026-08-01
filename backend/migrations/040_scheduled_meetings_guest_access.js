export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('account_type').notNullable().defaultTo('member')
    table.timestamp('guest_expires_at').nullable()
    table.timestamp('disabled_at').nullable()
    table.index(['account_type'], 'users_account_type_idx')
    table.index(['guest_expires_at'], 'users_guest_expires_at_idx')
  })

  await knex.schema.alterTable('meetings', (table) => {
    table.timestamp('scheduled_start_at').nullable()
    table.timestamp('scheduled_end_at').nullable()
    table.timestamp('join_not_before').nullable()
    table.timestamp('cancelled_at').nullable()
    table.text('description').nullable()
    table.string('visibility').notNullable().defaultTo('invitees')
    table.index(['scheduled_start_at'], 'meetings_scheduled_start_at_idx')
    table.index(['status', 'scheduled_start_at'], 'meetings_status_scheduled_start_at_idx')
  })

  await knex.schema.createTable('meeting_invite_links', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('token_hash').notNullable().unique()
    table.string('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('expires_at').nullable()
    table.timestamp('revoked_at').nullable()
    table.timestamp('last_used_at').nullable()
    table.integer('use_count').notNullable().defaultTo(0)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['meeting_id', 'revoked_at'], 'meeting_invite_links_meeting_revoked_idx')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_invite_links')

  await knex.schema.alterTable('meetings', (table) => {
    table.dropIndex(['status', 'scheduled_start_at'], 'meetings_status_scheduled_start_at_idx')
    table.dropIndex(['scheduled_start_at'], 'meetings_scheduled_start_at_idx')
    table.dropColumn('scheduled_start_at')
    table.dropColumn('scheduled_end_at')
    table.dropColumn('join_not_before')
    table.dropColumn('cancelled_at')
    table.dropColumn('description')
    table.dropColumn('visibility')
  })

  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['account_type'], 'users_account_type_idx')
    table.dropIndex(['guest_expires_at'], 'users_guest_expires_at_idx')
    table.dropColumn('account_type')
    table.dropColumn('guest_expires_at')
    table.dropColumn('disabled_at')
  })
}
