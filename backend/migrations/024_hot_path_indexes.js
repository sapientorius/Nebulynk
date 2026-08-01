const CHANNEL_MEMBERS_USER_ID_INDEX = 'channel_members_user_id_idx'
const CHANNEL_MEMBERS_USER_CHANNEL_INDEX = 'channel_members_user_channel_idx'
const VOICE_PARTICIPANTS_USER_ID_INDEX = 'voice_participants_user_id_idx'
const NOTIFICATIONS_USER_CREATED_AT_INDEX = 'notifications_user_created_at_idx'
const NOTIFICATIONS_USER_MESSAGE_INDEX = 'notifications_user_message_idx'
const NOTIFICATIONS_USER_MEETING_TYPE_INDEX = 'notifications_user_meeting_type_idx'
const MEETINGS_SOURCE_STATUS_STARTED_AT_INDEX = 'meetings_source_status_started_at_idx'
const MEETINGS_STATUS_STARTED_AT_INDEX = 'meetings_status_started_at_idx'
const MEETING_PARTICIPANTS_USER_MEETING_INDEX = 'meeting_participants_user_meeting_idx'

export async function up(knex) {
  await knex.schema.alterTable('channel_members', (table) => {
    table.index(['user_id'], CHANNEL_MEMBERS_USER_ID_INDEX)
    table.index(['user_id', 'channel_id'], CHANNEL_MEMBERS_USER_CHANNEL_INDEX)
  })

  await knex.schema.alterTable('voice_participants', (table) => {
    table.index(['user_id'], VOICE_PARTICIPANTS_USER_ID_INDEX)
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.index(['user_id', 'created_at'], NOTIFICATIONS_USER_CREATED_AT_INDEX)
    table.index(['user_id', 'message_id'], NOTIFICATIONS_USER_MESSAGE_INDEX)
    table.index(['user_id', 'meeting_id', 'type'], NOTIFICATIONS_USER_MEETING_TYPE_INDEX)
  })

  await knex.schema.alterTable('meetings', (table) => {
    table.index(['source_channel_id', 'status', 'started_at'], MEETINGS_SOURCE_STATUS_STARTED_AT_INDEX)
    table.index(['status', 'started_at'], MEETINGS_STATUS_STARTED_AT_INDEX)
  })

  await knex.schema.alterTable('meeting_participants', (table) => {
    table.index(['user_id', 'meeting_id'], MEETING_PARTICIPANTS_USER_MEETING_INDEX)
  })
}

export async function down(knex) {
  await knex.schema.alterTable('meeting_participants', (table) => {
    table.dropIndex(['user_id', 'meeting_id'], MEETING_PARTICIPANTS_USER_MEETING_INDEX)
  })

  await knex.schema.alterTable('meetings', (table) => {
    table.dropIndex(['status', 'started_at'], MEETINGS_STATUS_STARTED_AT_INDEX)
    table.dropIndex(['source_channel_id', 'status', 'started_at'], MEETINGS_SOURCE_STATUS_STARTED_AT_INDEX)
  })

  await knex.schema.alterTable('notifications', (table) => {
    table.dropIndex(['user_id', 'meeting_id', 'type'], NOTIFICATIONS_USER_MEETING_TYPE_INDEX)
    table.dropIndex(['user_id', 'message_id'], NOTIFICATIONS_USER_MESSAGE_INDEX)
    table.dropIndex(['user_id', 'created_at'], NOTIFICATIONS_USER_CREATED_AT_INDEX)
  })

  await knex.schema.alterTable('voice_participants', (table) => {
    table.dropIndex(['user_id'], VOICE_PARTICIPANTS_USER_ID_INDEX)
  })

  await knex.schema.alterTable('channel_members', (table) => {
    table.dropIndex(['user_id', 'channel_id'], CHANNEL_MEMBERS_USER_CHANNEL_INDEX)
    table.dropIndex(['user_id'], CHANNEL_MEMBERS_USER_ID_INDEX)
  })
}
