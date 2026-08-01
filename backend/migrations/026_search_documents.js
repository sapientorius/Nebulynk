const SEARCH_DOCUMENTS_TABLE = 'search_documents'
const SEARCH_DOCUMENTS_FTS_INDEX = 'search_documents_fts_idx'
const SEARCH_DOCUMENTS_TRGM_INDEX = 'search_documents_trgm_idx'
const SEARCH_DOCUMENTS_CURSOR_INDEX = 'search_documents_cursor_idx'
const SEARCH_DOCUMENTS_SCOPE_INDEX = 'search_documents_scope_idx'
const SEARCH_TEXT_SQL = "(coalesce(title, '') || ' ' || coalesce(content_text, '') || ' ' || coalesce(file_name, ''))"

function searchDocumentId(type, id) {
  return `${type}:${id}`
}

function extractFileExtension(name) {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return null
  return trimmed.slice(lastDot + 1).toLowerCase()
}

function normalizeArtifactTitle(artifactType, meetingTitle) {
  const labels = {
    transcript: 'Meeting transcript',
    summary: 'Meeting summary',
    actions: 'Meeting actions'
  }
  const base = labels[artifactType] || 'Meeting artifact'
  return meetingTitle ? `${base}: ${meetingTitle}` : base
}

function extractArtifactContent(payload, artifactType) {
  if (!payload || typeof payload !== 'object') return null

  if (artifactType === 'actions' && Array.isArray(payload.actions)) {
    const lines = payload.actions
      .map((action) => {
        if (!action || typeof action !== 'object') return null
        const parts = [
          action.title,
          action.summary,
          action.description,
          action.owner_name,
          action.due_date
        ].filter(Boolean)
        return parts.join(' - ')
      })
      .filter(Boolean)
    return lines.length > 0 ? lines.join('\n') : null
  }

  const candidates = [
    payload.text,
    payload.summary,
    payload.content,
    payload.markdown,
    payload.transcript,
    payload.description
  ].filter((value) => typeof value === 'string' && value.trim())

  if (candidates.length > 0) {
    return candidates[0].trim()
  }

  if (Array.isArray(payload.segments)) {
    const lines = payload.segments
      .map((segment) => {
        if (typeof segment === 'string') return segment.trim()
        if (segment && typeof segment.text === 'string') return segment.text.trim()
        return null
      })
      .filter(Boolean)
    return lines.length > 0 ? lines.join('\n') : null
  }

  return null
}

export async function up(knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm')

  const hasSearchDocumentsTable = await knex.schema.hasTable(SEARCH_DOCUMENTS_TABLE)
  if (!hasSearchDocumentsTable) {
    await knex.schema.createTable(SEARCH_DOCUMENTS_TABLE, (table) => {
      table.string('id').primary()
      table.string('document_type').notNullable()
      table.string('document_id').notNullable()
      table.string('source_channel_id').nullable().references('id').inTable('channels').onDelete('CASCADE')
      table.string('source_message_id').nullable().references('id').inTable('messages').onDelete('CASCADE')
      table.string('source_meeting_id').nullable().references('id').inTable('meetings').onDelete('CASCADE')
      table.string('owner_user_id').nullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('author_user_id').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.string('title').nullable()
      table.text('content_text').nullable()
      table.string('file_name').nullable()
      table.string('file_extension').nullable()
      table.string('mime_type').nullable()
      table.jsonb('metadata').nullable()
      table.string('embedding_model').nullable()
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

      table.unique(['document_type', 'document_id'])
      table.index(['document_type'])
      table.index(['source_channel_id'])
      table.index(['source_message_id'])
      table.index(['source_meeting_id'])
      table.index(['owner_user_id'])
      table.index(['author_user_id'])
      table.index(['file_extension'])
    })
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${SEARCH_DOCUMENTS_FTS_INDEX}
    ON ${SEARCH_DOCUMENTS_TABLE}
    USING gin (to_tsvector('simple', ${SEARCH_TEXT_SQL}))
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${SEARCH_DOCUMENTS_TRGM_INDEX}
    ON ${SEARCH_DOCUMENTS_TABLE}
    USING gin (lower(${SEARCH_TEXT_SQL}) gin_trgm_ops)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${SEARCH_DOCUMENTS_CURSOR_INDEX}
    ON ${SEARCH_DOCUMENTS_TABLE} (created_at DESC, id DESC)
  `)

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${SEARCH_DOCUMENTS_SCOPE_INDEX}
    ON ${SEARCH_DOCUMENTS_TABLE} (document_type, source_channel_id, owner_user_id, created_at DESC)
  `)

  const messages = await knex('messages as m')
    .leftJoin('users as u', 'u.id', 'm.user_id')
    .leftJoin('channels as c', 'c.id', 'm.channel_id')
    .whereNull('m.deleted_at')
    .where('m.type', '<>', 'system')
    .whereRaw("NULLIF(BTRIM(COALESCE(m.content, '')), '') IS NOT NULL")
    .select(
      'm.id',
      'm.channel_id',
      'm.user_id',
      'm.created_at',
      'm.updated_at',
      'm.content',
      'c.name as channel_name',
      'c.type as channel_type',
      'c.purpose as channel_purpose',
      'u.display_name as author_display_name'
    )

  if (messages.length > 0) {
    await knex(SEARCH_DOCUMENTS_TABLE).insert(messages.map((message) => ({
      id: searchDocumentId('message', message.id),
      document_type: 'message',
      document_id: message.id,
      source_channel_id: message.channel_id,
      source_message_id: message.id,
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: message.user_id,
      title: null,
      content_text: message.content,
      file_name: null,
      file_extension: null,
      mime_type: null,
      metadata: {
        channel_name: message.channel_name || null,
        channel_type: message.channel_type || null,
        channel_purpose: message.channel_purpose || null,
        author_display_name: message.author_display_name || null,
        navigation_target: `/channels/${encodeURIComponent(message.channel_id)}?message=${encodeURIComponent(message.id)}`
      },
      embedding_model: null,
      created_at: message.created_at,
      updated_at: message.updated_at || message.created_at
    })))
  }

  const files = await knex('files as f')
    .join('messages as m', 'm.id', 'f.message_id')
    .leftJoin('users as u', 'u.id', 'f.user_id')
    .leftJoin('channels as c', 'c.id', 'm.channel_id')
    .whereNull('m.deleted_at')
    .select(
      'f.id',
      'f.message_id',
      'f.user_id',
      'f.original_name',
      'f.mime_type',
      'f.size',
      'f.created_at',
      'f.updated_at',
      'm.channel_id',
      'm.content as message_content',
      'c.name as channel_name',
      'c.type as channel_type',
      'c.purpose as channel_purpose',
      'u.display_name as author_display_name'
    )

  if (files.length > 0) {
    await knex(SEARCH_DOCUMENTS_TABLE).insert(files.map((file) => ({
      id: searchDocumentId('file', file.id),
      document_type: 'file',
      document_id: file.id,
      source_channel_id: file.channel_id,
      source_message_id: file.message_id,
      source_meeting_id: null,
      owner_user_id: null,
      author_user_id: file.user_id,
      title: file.original_name,
      content_text: file.message_content || null,
      file_name: file.original_name,
      file_extension: extractFileExtension(file.original_name),
      mime_type: file.mime_type,
      metadata: {
        author_display_name: file.author_display_name || null,
        channel_name: file.channel_name || null,
        channel_type: file.channel_type || null,
        channel_purpose: file.channel_purpose || null,
        navigation_target: `/channels/${encodeURIComponent(file.channel_id)}?message=${encodeURIComponent(file.message_id)}`,
        size: file.size
      },
      embedding_model: null,
      created_at: file.created_at,
      updated_at: file.updated_at || file.created_at
    })))
  }

  const artifacts = await knex('meeting_artifacts as artifact')
    .join('meetings as meeting', 'meeting.id', 'artifact.meeting_id')
    .leftJoin('channels as source_channel', 'source_channel.id', 'meeting.source_channel_id')
    .leftJoin('users as host_user', 'host_user.id', 'meeting.host_user_id')
    .whereNotNull('artifact.payload')
    .where('artifact.status', 'ready')
    .select(
      'artifact.id',
      'artifact.meeting_id',
      'artifact.artifact_type',
      'artifact.payload',
      'artifact.created_at',
      'artifact.updated_at',
      'meeting.title as meeting_title',
      'meeting.source_channel_id',
      'meeting.host_user_id',
      'source_channel.name as channel_name',
      'source_channel.type as channel_type',
      'source_channel.purpose as channel_purpose',
      'host_user.display_name as author_display_name'
    )

  const artifactDocs = artifacts
    .map((artifact) => {
      const contentText = extractArtifactContent(artifact.payload, artifact.artifact_type)
      if (!contentText) return null
      const documentType = `meeting_${artifact.artifact_type}`
      return {
        id: searchDocumentId(documentType, artifact.id),
        document_type: documentType,
        document_id: artifact.id,
        source_channel_id: artifact.source_channel_id || null,
        source_message_id: null,
        source_meeting_id: artifact.meeting_id,
        owner_user_id: null,
        author_user_id: artifact.host_user_id || null,
        title: normalizeArtifactTitle(artifact.artifact_type, artifact.meeting_title),
        content_text: contentText,
        file_name: null,
        file_extension: null,
        mime_type: null,
        metadata: {
          artifact_type: artifact.artifact_type,
          author_display_name: artifact.author_display_name || null,
          channel_name: artifact.channel_name || null,
          channel_type: artifact.channel_type || null,
          channel_purpose: artifact.channel_purpose || null,
          meeting_title: artifact.meeting_title || null,
          navigation_target: `/meetings/${encodeURIComponent(artifact.meeting_id)}`
        },
        embedding_model: null,
        created_at: artifact.updated_at || artifact.created_at,
        updated_at: artifact.updated_at || artifact.created_at
      }
    })
    .filter(Boolean)

  if (artifactDocs.length > 0) {
    await knex(SEARCH_DOCUMENTS_TABLE).insert(artifactDocs)
  }
}

export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS ${SEARCH_DOCUMENTS_SCOPE_INDEX}`)
  await knex.raw(`DROP INDEX IF EXISTS ${SEARCH_DOCUMENTS_CURSOR_INDEX}`)
  await knex.raw(`DROP INDEX IF EXISTS ${SEARCH_DOCUMENTS_TRGM_INDEX}`)
  await knex.raw(`DROP INDEX IF EXISTS ${SEARCH_DOCUMENTS_FTS_INDEX}`)
  await knex.schema.dropTableIfExists(SEARCH_DOCUMENTS_TABLE)
}
