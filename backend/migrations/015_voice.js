export async function up(knex) {
  // Extend channels.type enum to include 'voice'
  await knex.raw(`
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
    ALTER TABLE channels ADD CONSTRAINT channels_type_check
      CHECK (type IN ('public', 'private', 'dm', 'group', 'voice'));
  `)

  // Transient table: rows exist only while a user is in a voice channel
  await knex.schema.createTable('voice_participants', (table) => {
    table.string('id').primary()
    table.string('channel_id').notNullable().references('id').inTable('channels').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.boolean('is_muted').defaultTo(false)
    table.boolean('is_deafened').defaultTo(false)
    table.timestamp('joined_at').defaultTo(knex.fn.now())

    table.unique(['channel_id', 'user_id'])
  })

  // Add voice permission
  const existing = await knex('permissions').where('name', 'join_voice_channels').first()
  if (!existing) {
    const { createId } = await import('@paralleldrive/cuid2')
    const permId = createId()
    await knex('permissions').insert({
      id: permId,
      name: 'join_voice_channels',
      description: 'Einem Voice-Channel beitreten'
    })

    // Grant to all existing roles
    const roles = await knex('roles').select('id')
    if (roles.length > 0) {
      const rolePerms = roles.map((role) => ({
        id: createId(),
        role_id: role.id,
        permission_id: permId
      }))
      await knex('role_permissions').insert(rolePerms)
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('voice_participants')

  // Remove voice permission and its role assignments
  const perm = await knex('permissions').where('name', 'join_voice_channels').first()
  if (perm) {
    await knex('role_permissions').where('permission_id', perm.id).del()
    await knex('permissions').where('id', perm.id).del()
  }

  // Revert channels.type enum
  await knex.raw(`
    ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_type_check;
    ALTER TABLE channels ADD CONSTRAINT channels_type_check
      CHECK (type IN ('public', 'private', 'dm', 'group'));
  `)
}
