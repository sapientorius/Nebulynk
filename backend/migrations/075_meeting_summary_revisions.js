export async function up(knex) {
  await knex.schema.alterTable('meeting_artifacts', table => {
    table.integer('summary_version').notNullable().defaultTo(0)
  })
  await knex.schema.createTable('meeting_summary_revisions', table => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.string('parent_revision_id').nullable().references('id').inTable('meeting_summary_revisions').onDelete('SET NULL')
    table.integer('base_version').notNullable()
    table.string('status').notNullable().defaultTo('draft')
    table.string('kind').notNullable().defaultTo('edit')
    table.text('instructions').nullable()
    table.jsonb('before_payload').notNullable()
    table.jsonb('payload').nullable()
    table.text('change_summary').nullable()
    table.boolean('publish_change').notNullable().defaultTo(false)
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('applied_at').nullable()
    table.index(['meeting_id', 'status', 'publish_change', 'applied_at'])
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_summary_revisions')
  await knex.schema.alterTable('meeting_artifacts', table => table.dropColumn('summary_version'))
}
