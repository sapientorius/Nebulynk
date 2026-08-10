const REGISTRATION_PENDING_REASON_INDEX = 'users_registration_pending_reason_idx'

export async function up(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.string('registration_pending_reason').nullable()
    table.index(['registration_status', 'registration_pending_reason'], REGISTRATION_PENDING_REASON_INDEX)
  })

  // These existing records are unambiguous: this status is only reached after
  // email confirmation when administrator approval is required.
  await knex('users')
    .where('registration_status', 'pending_admin_approval')
    .update({ registration_pending_reason: 'email_confirmed_admin_approval' })
}

export async function down(knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['registration_status', 'registration_pending_reason'], REGISTRATION_PENDING_REASON_INDEX)
    table.dropColumn('registration_pending_reason')
  })
}
