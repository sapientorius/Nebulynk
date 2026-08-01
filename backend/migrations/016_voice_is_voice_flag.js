export async function up(knex) {
  // Add is_voice boolean column (default false)
  await knex.schema.alterTable('channels', (table) => {
    table.boolean('is_voice').defaultTo(false)
  })

  // Migrate existing voice channels: set is_voice=true, type=public
  await knex('channels')
    .where('type', 'voice')
    .update({ is_voice: true, type: 'public' })

  // Remove 'voice' from type enum — no longer a separate type
  await knex.raw(`
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
    ALTER TABLE channels ADD CONSTRAINT channels_type_check
      CHECK (type IN ('public', 'private', 'dm', 'group'));
  `)
}

export async function down(knex) {
  // Re-add 'voice' to type enum
  await knex.raw(`
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
    ALTER TABLE channels ADD CONSTRAINT channels_type_check
      CHECK (type IN ('public', 'private', 'dm', 'group', 'voice'));
  `)

  // Revert voice channels back to type='voice'
  await knex('channels')
    .where('is_voice', true)
    .update({ type: 'voice' })

  // Drop is_voice column
  await knex.schema.alterTable('channels', (table) => {
    table.dropColumn('is_voice')
  })
}
