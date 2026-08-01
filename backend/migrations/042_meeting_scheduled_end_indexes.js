const MEETINGS_SCHEDULED_END_AT_INDEX = 'meetings_scheduled_end_at_idx'
const MEETINGS_STATUS_SCHEDULED_END_AT_INDEX = 'meetings_status_scheduled_end_at_idx'

export async function up(knex) {
  await knex.schema.alterTable('meetings', (table) => {
    table.index(['scheduled_end_at'], MEETINGS_SCHEDULED_END_AT_INDEX)
    table.index(['status', 'scheduled_end_at'], MEETINGS_STATUS_SCHEDULED_END_AT_INDEX)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('meetings', (table) => {
    table.dropIndex(['status', 'scheduled_end_at'], MEETINGS_STATUS_SCHEDULED_END_AT_INDEX)
    table.dropIndex(['scheduled_end_at'], MEETINGS_SCHEDULED_END_AT_INDEX)
  })
}
