import { createId } from '@paralleldrive/cuid2'

const DEFAULT_ACCESS = 'all_channel_members'

export async function up(knex) {
  await knex.schema.alterTable('channels', (table) => {
    table.string('meeting_history_access').nullable().index()
  })

  await knex.schema.createTable('meeting_start_members', (table) => {
    table.string('id').primary()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.unique(['meeting_id', 'user_id'])
    table.index(['user_id'])
  })

  await knex('channels')
    .whereIn('type', ['public', 'private', 'group'])
    .where((builder) => builder.whereNull('purpose').orWhere('purpose', 'default'))
    .update({ meeting_history_access: DEFAULT_ACCESS })

  await knex('platform_settings')
    .insert({ key: 'default_meeting_history_access', value: DEFAULT_ACCESS })
    .onConflict('key')
    .ignore()

  const legacyParticipants = await knex('meeting_participants')
    .join('meetings', 'meetings.id', 'meeting_participants.meeting_id')
    .join('channels', 'channels.id', 'meetings.source_channel_id')
    .whereIn('channels.type', ['public', 'private', 'group'])
    .distinct('meeting_participants.meeting_id', 'meeting_participants.user_id')

  if (legacyParticipants.length > 0) {
    await knex('meeting_start_members')
      .insert(legacyParticipants.map((participant) => ({
        id: createId(),
        meeting_id: participant.meeting_id,
        user_id: participant.user_id
      })))
      .onConflict(['meeting_id', 'user_id'])
      .ignore()
  }
}

export async function down(knex) {
  await knex('platform_settings').where('key', 'default_meeting_history_access').del()
  await knex.schema.dropTableIfExists('meeting_start_members')
  await knex.schema.alterTable('channels', (table) => {
    table.dropColumn('meeting_history_access')
  })
}
