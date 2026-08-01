import { createWebauthnUserId, encodeBytesForStorage } from '../src/lib/passkeys.js'

export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('webauthn_user_id').unique().nullable()
  })

  const existingUsers = await knex('users').select('id', 'webauthn_user_id')
  for (const user of existingUsers) {
    if (typeof user.webauthn_user_id === 'string' && user.webauthn_user_id.trim()) {
      continue
    }

    await knex('users')
      .where('id', user.id)
      .update({
        webauthn_user_id: encodeBytesForStorage(createWebauthnUserId())
      })
  }

  await knex.schema.alterTable('users', (table) => {
    table.string('webauthn_user_id').notNullable().alter()
  })

  await knex.schema.createTable('user_passkeys', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('credential_id').notNullable().unique()
    table.text('public_key').notNullable()
    table.bigInteger('counter').notNullable().defaultTo(0)
    table.string('device_type').notNullable()
    table.boolean('backed_up').notNullable().defaultTo(false)
    table.text('transports').nullable()
    table.string('name', 120).nullable()
    table.timestamp('last_used_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['user_id', 'created_at'], 'user_passkeys_user_created_idx')
  })

  await knex.schema.createTable('auth_passkey_challenges', (table) => {
    table.string('id').primary()
    table.string('user_id').nullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('flow').notNullable()
    table.text('challenge').notNullable()
    table.boolean('remember').notNullable().defaultTo(false)
    table.timestamp('expires_at').notNullable()
    table.timestamp('used_at').nullable()
    table.string('created_ip').nullable()
    table.string('user_agent').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())

    table.index(['flow', 'used_at'], 'auth_passkey_challenges_flow_used_idx')
    table.index(['expires_at', 'used_at'], 'auth_passkey_challenges_expires_used_idx')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('auth_passkey_challenges')
  await knex.schema.dropTableIfExists('user_passkeys')
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('webauthn_user_id')
  })
}
