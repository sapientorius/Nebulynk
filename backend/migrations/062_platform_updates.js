export async function up(knex) {
  await knex.schema.createTable('platform_update_state', (table) => {
    table.string('id').primary()
    table.boolean('checks_enabled').notNullable().defaultTo(true)
    table.string('observed_version')
    table.jsonb('cached_catalog')
    table.text('feed_etag')
    table.bigInteger('feed_sequence').notNullable().defaultTo(0)
    table.timestamp('last_attempt_at')
    table.timestamp('last_success_at')
    table.string('last_error_code')
    table.integer('consecutive_failures').notNullable().defaultTo(0)
    table.timestamp('next_check_at')
    table.string('lease_token')
    table.timestamp('lease_expires_at')
    table.timestamp('disabled_at')
    table.string('disabled_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex('platform_update_state').insert({ id: 'default', checks_enabled: true })

  await knex.schema.createTable('platform_update_acknowledgements', (table) => {
    table.bigIncrements('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('installed_version').notNullable()
    table.string('release_version').notNullable()
    table.integer('release_revision').notNullable()
    table.timestamp('acknowledged_at').notNullable().defaultTo(knex.fn.now())
    table.unique(['user_id', 'installed_version', 'release_version', 'release_revision'], {
      indexName: 'platform_update_ack_unique'
    })
  })

  await knex.schema.createTable('platform_update_email_deliveries', (table) => {
    table.bigIncrements('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('installed_version').notNullable()
    table.string('release_version').notNullable()
    table.integer('release_revision').notNullable()
    table.string('status').notNullable().defaultTo('pending')
    table.integer('attempts').notNullable().defaultTo(0)
    table.string('last_error_code')
    table.timestamp('last_attempt_at')
    table.timestamp('sent_at')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
    table.unique(['user_id', 'installed_version', 'release_version', 'release_revision'], {
      indexName: 'platform_update_email_unique'
    })
  })

  await knex.schema.createTable('platform_update_audit_events', (table) => {
    table.bigIncrements('id').primary()
    table.string('action').notNullable()
    table.string('actor_id').references('id').inTable('users').onDelete('SET NULL')
    table.boolean('checks_enabled').notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.index(['created_at'])
  })

  await knex.raw("ALTER TABLE platform_update_state ADD CONSTRAINT platform_update_state_singleton CHECK (id = 'default')")
  await knex.raw("ALTER TABLE platform_update_email_deliveries ADD CONSTRAINT platform_update_email_status_valid CHECK (status IN ('pending', 'failed', 'sent'))")
  await knex.raw("ALTER TABLE platform_update_audit_events ADD CONSTRAINT platform_update_audit_action_valid CHECK (action IN ('checks_enabled', 'checks_disabled'))")
  await knex.raw(`
    CREATE FUNCTION prevent_platform_update_audit_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'platform_update_audit_events is append-only';
    END;
    $$ LANGUAGE plpgsql
  `)
  await knex.raw(`
    CREATE TRIGGER platform_update_audit_append_only
    BEFORE UPDATE OR DELETE ON platform_update_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_platform_update_audit_mutation()
  `)
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('platform_update_audit_events')
  await knex.schema.dropTableIfExists('platform_update_email_deliveries')
  await knex.schema.dropTableIfExists('platform_update_acknowledgements')
  await knex.schema.dropTableIfExists('platform_update_state')
  await knex.raw('DROP FUNCTION IF EXISTS prevent_platform_update_audit_mutation()')
}
