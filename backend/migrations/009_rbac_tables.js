import { createId } from '@paralleldrive/cuid2'

export async function up(knex) {
  // --- Tables ---

  await knex.schema.createTable('roles', (table) => {
    table.string('id').primary()
    table.string('name').unique().notNullable()
    table.text('description')
    table.enum('scope', ['platform', 'channel']).notNullable()
    table.boolean('is_system').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('permissions', (table) => {
    table.string('id').primary()
    table.string('name').unique().notNullable()
    table.text('description')
    table.string('category')
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('role_permissions', (table) => {
    table.string('id').primary()
    table.string('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE')
    table.string('permission_id').notNullable().references('id').inTable('permissions').onDelete('CASCADE')
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['role_id', 'permission_id'])
  })

  // --- Seed: System Roles ---

  const roles = [
    { id: createId(), name: 'platform:admin', description: 'Plattform-Administrator mit vollen Rechten', scope: 'platform', is_system: true },
    { id: createId(), name: 'platform:moderator', description: 'Plattform-Moderator', scope: 'platform', is_system: true },
    { id: createId(), name: 'platform:member', description: 'Standard-Mitglied', scope: 'platform', is_system: true },
    { id: createId(), name: 'channel:owner', description: 'Channel-Eigentümer', scope: 'channel', is_system: true },
    { id: createId(), name: 'channel:admin', description: 'Channel-Administrator', scope: 'channel', is_system: true },
    { id: createId(), name: 'channel:member', description: 'Channel-Mitglied', scope: 'channel', is_system: true }
  ]
  await knex('roles').insert(roles)

  // --- Seed: Permissions ---

  const permissions = [
    { id: createId(), name: 'manage_platform', description: 'Plattform-Einstellungen ändern', category: 'platform' },
    { id: createId(), name: 'manage_users', description: 'Nutzer verwalten', category: 'platform' },
    { id: createId(), name: 'manage_roles', description: 'Rollen & Permissions verwalten', category: 'platform' },
    { id: createId(), name: 'create_invites', description: 'Nutzer einladen', category: 'platform' },
    { id: createId(), name: 'create_channels', description: 'Channels erstellen', category: 'channel' },
    { id: createId(), name: 'manage_channels', description: 'Channels bearbeiten/löschen', category: 'channel' },
    { id: createId(), name: 'manage_channel_members', description: 'Mitglieder hinzufügen/entfernen', category: 'channel' },
    { id: createId(), name: 'send_messages', description: 'Nachrichten senden', category: 'messaging' },
    { id: createId(), name: 'manage_messages', description: 'Fremde Nachrichten bearbeiten/löschen', category: 'messaging' },
    { id: createId(), name: 'pin_messages', description: 'Nachrichten pinnen', category: 'messaging' },
    { id: createId(), name: 'upload_files', description: 'Dateien hochladen', category: 'messaging' }
  ]
  await knex('permissions').insert(permissions)

  // --- Seed: Role-Permission Mappings ---

  // Helper to look up IDs
  const roleMap = {}
  for (const r of roles) { roleMap[r.name] = r.id }

  const permMap = {}
  for (const p of permissions) { permMap[p.name] = p.id }

  const allPermNames = permissions.map(p => p.name)

  const mappings = {
    'platform:admin': allPermNames,
    'platform:moderator': [
      'create_invites', 'create_channels', 'manage_channels',
      'manage_channel_members', 'send_messages', 'manage_messages',
      'pin_messages', 'upload_files'
    ],
    'platform:member': [
      'create_channels', 'send_messages', 'pin_messages', 'upload_files'
    ],
    'channel:owner': [
      'manage_channels', 'manage_channel_members', 'send_messages',
      'manage_messages', 'pin_messages', 'upload_files'
    ],
    'channel:admin': [
      'manage_channel_members', 'send_messages', 'manage_messages',
      'pin_messages', 'upload_files'
    ],
    'channel:member': [
      'send_messages', 'pin_messages', 'upload_files'
    ]
  }

  const rolePermissions = []
  for (const [roleName, permNames] of Object.entries(mappings)) {
    for (const permName of permNames) {
      rolePermissions.push({
        id: createId(),
        role_id: roleMap[roleName],
        permission_id: permMap[permName]
      })
    }
  }
  await knex('role_permissions').insert(rolePermissions)
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('role_permissions')
  await knex.schema.dropTableIfExists('permissions')
  await knex.schema.dropTableIfExists('roles')
}
