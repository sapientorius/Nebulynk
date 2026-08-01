export async function up(knex) {
  const hasFilesPurpose = await knex.schema.hasColumn('files', 'purpose')
  const hasFilesDuration = await knex.schema.hasColumn('files', 'duration_ms')

  if (!hasFilesPurpose || !hasFilesDuration) {
    await knex.schema.alterTable('files', (table) => {
      if (!hasFilesPurpose) {
        table.string('purpose').notNullable().defaultTo('attachment')
      }
      if (!hasFilesDuration) {
        table.integer('duration_ms').nullable()
      }
    })
  }

  const hasArtifactsTable = await knex.schema.hasTable('voice_message_artifacts')
  if (!hasArtifactsTable) {
    await knex.schema.createTable('voice_message_artifacts', (table) => {
      table.string('id').primary()
      table.string('message_id').notNullable().references('id').inTable('messages').onDelete('CASCADE')
      table.string('file_id').notNullable().references('id').inTable('files').onDelete('CASCADE')
      table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('status').notNullable().defaultTo('pending')
      table.text('transcript').nullable()
      table.text('summary').nullable()
      table.string('language').nullable()
      table.jsonb('payload').nullable()
      table.string('failure_code').nullable()
      table.text('failure_message').nullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

      table.unique(['file_id', 'user_id'])
      table.index(['message_id', 'user_id'])
      table.index(['user_id', 'status'])
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('voice_message_artifacts')

  const hasDuration = await knex.schema.hasColumn('files', 'duration_ms')
  const hasPurpose = await knex.schema.hasColumn('files', 'purpose')
  if (hasDuration || hasPurpose) {
    await knex.schema.alterTable('files', (table) => {
      if (hasDuration) table.dropColumn('duration_ms')
      if (hasPurpose) table.dropColumn('purpose')
    })
  }
}
