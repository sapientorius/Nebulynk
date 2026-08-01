const MESSAGE_SEARCH_FTS_INDEX = 'messages_search_fts_idx'
const MESSAGE_SEARCH_TRIGRAM_INDEX = 'messages_search_trgm_idx'
const MESSAGE_TIMELINE_CURSOR_INDEX = 'messages_channel_created_id_idx'

export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm')

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${MESSAGE_SEARCH_FTS_INDEX}
    ON messages
    USING gin (to_tsvector('simple', content))
    WHERE deleted_at IS NULL AND type <> 'system'
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${MESSAGE_SEARCH_TRIGRAM_INDEX}
    ON messages
    USING gin (lower(content) gin_trgm_ops)
    WHERE deleted_at IS NULL AND type <> 'system'
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${MESSAGE_TIMELINE_CURSOR_INDEX}
    ON messages (channel_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL
  `)
}

export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ${MESSAGE_TIMELINE_CURSOR_INDEX}`)
  await knex.raw(`DROP INDEX IF EXISTS ${MESSAGE_SEARCH_TRIGRAM_INDEX}`)
  await knex.raw(`DROP INDEX IF EXISTS ${MESSAGE_SEARCH_FTS_INDEX}`)
}
