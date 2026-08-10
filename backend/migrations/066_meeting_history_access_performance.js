export const config = { transaction: false }

const MEETINGS_CHAT_CHANNEL_INDEX = 'meetings_chat_channel_id_idx'
const START_MEMBERS_USER_MEETING_INDEX = 'meeting_start_members_user_meeting_idx'

export async function up(knex) {
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS ${MEETINGS_CHAT_CHANNEL_INDEX}
    ON meetings (chat_channel_id)
  `)
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS ${START_MEMBERS_USER_MEETING_INDEX}
    ON meeting_start_members (user_id, meeting_id)
  `)
}

export async function down(knex) {
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${START_MEMBERS_USER_MEETING_INDEX}`)
  await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${MEETINGS_CHAT_CHANNEL_INDEX}`)
}
