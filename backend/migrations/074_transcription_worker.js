import { createId } from '@paralleldrive/cuid2'

export async function up(knex) {
  await knex.schema.alterTable('meeting_artifacts', (table) => {
    table.string('transcription_generation').nullable()
  })

  await knex.schema.createTable('meeting_transcription_jobs', (table) => {
    table.string('id').primary()
    table.string('artifact_id').notNullable().references('id').inTable('meeting_artifacts').onDelete('CASCADE')
    table.string('recording_id').notNullable().references('id').inTable('meeting_recordings').onDelete('CASCADE')
    table.string('generation').notNullable()
    table.string('status').notNullable().defaultTo('queued')
    table.integer('attempt_count').notNullable().defaultTo(0)
    table.timestamp('next_run_at').nullable()
    table.string('lease_token').nullable()
    table.timestamp('lease_until').nullable()
    table.string('source_signature').nullable()
    table.string('runtime_signature').nullable()
    table.string('failure_code').nullable()
    table.text('failure_message').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

    table.unique(['artifact_id', 'recording_id', 'generation'])
    table.index(['status', 'next_run_at'])
    table.index(['artifact_id', 'generation'])
  })

  await knex.schema.createTable('meeting_transcription_chunks', (table) => {
    table.string('id').primary()
    table.string('job_id').notNullable().references('id').inTable('meeting_transcription_jobs').onDelete('CASCADE')
    table.integer('chunk_index').notNullable()
    table.integer('start_ms').notNullable()
    table.integer('end_ms').notNullable()
    table.string('language').nullable()
    table.jsonb('segments').notNullable()
    table.jsonb('filter_summary').notNullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.unique(['job_id', 'chunk_index'])
  })

  await knex.schema.createTable('meeting_transcription_events', (table) => {
    table.string('id').primary()
    table.string('artifact_id').notNullable().references('id').inTable('meeting_artifacts').onDelete('CASCADE')
    table.string('generation').notNullable()
    table.string('meeting_id').notNullable().references('id').inTable('meetings').onDelete('CASCADE')
    table.timestamp('delivered_at').nullable()
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())

    table.unique(['artifact_id', 'generation'])
    table.index(['delivered_at', 'created_at'])
  })

  const pendingArtifacts = await knex('meeting_artifacts')
    .where('artifact_type', 'transcript')
    .whereIn('status', ['pending', 'processing'])
    .select('id', 'meeting_id')

  for (const artifact of pendingArtifacts) {
    const generation = createId()
    await knex('meeting_artifacts').where('id', artifact.id).update({
      transcription_generation: generation,
      status: 'processing'
    })
    const recordings = await knex('meeting_recordings').where('meeting_id', artifact.meeting_id).select('id')
    if (recordings.length > 0) {
      await knex('meeting_transcription_jobs').insert(recordings.map((recording) => ({
        id: createId(),
        artifact_id: artifact.id,
        recording_id: recording.id,
        generation
      })))
    }
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('meeting_transcription_events')
  await knex.schema.dropTableIfExists('meeting_transcription_chunks')
  await knex.schema.dropTableIfExists('meeting_transcription_jobs')
  await knex.schema.alterTable('meeting_artifacts', (table) => {
    table.dropColumn('transcription_generation')
  })
}
