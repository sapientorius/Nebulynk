import { createId } from '@paralleldrive/cuid2'

export async function up(knex) {
  await knex.schema.createTable('user_roles', (table) => {
    table.string('id').primary()
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('role_id').notNullable().references('id').inTable('roles').onDelete('CASCADE')
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['user_id', 'role_id'])
  })

  // Seed: Assign platform roles to existing users
  const adminRole = await knex('roles').where({ name: 'platform:admin' }).first()
  const memberRole = await knex('roles').where({ name: 'platform:member' }).first()

  if (!adminRole || !memberRole) return

  const users = await knex('users').select('id', 'is_admin')

  const userRoles = users.map((user) => ({
    id: createId(),
    user_id: user.id,
    role_id: user.is_admin ? adminRole.id : memberRole.id
  }))

  if (userRoles.length > 0) {
    await knex('user_roles').insert(userRoles)
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('user_roles')
}
