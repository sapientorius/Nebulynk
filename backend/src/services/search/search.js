import { authenticate } from '@feathersjs/authentication'
import { badRequest } from '../../lib/errors.js'
import {
  assertCanReadChannel,
  buildAccessibleContentScopeSql
} from '../../domains/meetings/content-access.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_QUERY_LENGTH = 3
const MESSAGE_DOCUMENT_TYPES = ['message']
const MEETING_DOCUMENT_TYPES = ['meeting_transcript', 'meeting_summary']
const MEETING_AUTHOR_SPEAKER_DOCUMENT_TYPES = ['message', 'meeting_transcript_segment']
const FILE_DOCUMENT_TYPES = ['file']
const ALL_DOCUMENT_TYPES = [
  'message',
  'file',
  'meeting_transcript',
  'meeting_transcript_segment',
  'meeting_summary',
  'meeting_actions',
  'channel_summary',
  'unread_summary'
]

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function normalizeDate(rawValue, field) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null
  const date = new Date(rawValue)
  if (Number.isNaN(date.getTime())) {
    throw badRequest('api.validation.failed', {
      errors: [{ field, message: 'must be date-time' }]
    }, 'Validierungsfehler')
  }
  return date.toISOString()
}

function normalizeCursor(query = {}) {
  const beforeCreatedAt = typeof query.before_created_at === 'string'
    ? query.before_created_at.trim()
    : ''
  const beforeId = typeof query.before_id === 'string'
    ? query.before_id.trim()
    : ''

  if (!beforeCreatedAt && !beforeId) {
    return {
      beforeCreatedAt: null,
      beforeId: null
    }
  }

  if (!beforeCreatedAt || !beforeId) {
    throw badRequest('api.search.cursor_pair_required', {}, 'before_created_at und before_id muessen gemeinsam gesetzt werden')
  }

  return {
    beforeCreatedAt: normalizeDate(beforeCreatedAt, '/query/before_created_at'),
    beforeId
  }
}

function normalizeDocumentTypes(query = {}, tab = 'messages') {
  const rawTypes = query.document_types ?? query['document_types[]']
  const values = Array.isArray(rawTypes)
    ? rawTypes
    : typeof rawTypes === 'string'
      ? rawTypes.split(',').map((value) => value.trim())
      : []
  const filtered = values.filter(Boolean)
  const types = filtered.length > 0
    ? filtered
    : (tab === 'files'
        ? FILE_DOCUMENT_TYPES
        : (tab === 'meetings' ? MEETING_DOCUMENT_TYPES : MESSAGE_DOCUMENT_TYPES))

  for (const type of types) {
    if (!ALL_DOCUMENT_TYPES.includes(type)) {
      throw badRequest('api.search.invalid_document_type', { document_type: type }, 'Ungueltiger Dokumenttyp')
    }
  }

  return [...new Set(types)]
}

function resolveDocumentTypes(query = {}, { tab = 'messages', fromUserId = null } = {}) {
  if (tab === 'meetings' && fromUserId) {
    return MEETING_AUTHOR_SPEAKER_DOCUMENT_TYPES
  }

  return normalizeDocumentTypes(query, tab)
}

export function normalizeSearchQuery(query = {}) {
  const rawTerm = typeof query.q === 'string' ? query.q.trim() : ''
  const tab = query.tab === 'files'
    ? 'files'
    : (query.tab === 'meetings' ? 'meetings' : 'messages')
  const requestedMatchMode = ['keyword', 'semantic', 'hybrid'].includes(query.match_mode)
    ? query.match_mode
    : 'keyword'
  const channelId = typeof query.channel_id === 'string' && query.channel_id.trim()
    ? query.channel_id.trim()
    : null
  const fromUserId = typeof query.from_user_id === 'string' && query.from_user_id.trim()
    ? query.from_user_id.trim()
    : null
  const fileExtension = typeof query.file_extension === 'string' && query.file_extension.trim()
    ? query.file_extension.trim().replace(/^\./, '').toLowerCase()
    : null
  const after = normalizeDate(query.after, '/query/after')
  const before = normalizeDate(query.before, '/query/before')

  const hasStructuredFilter = Boolean(channelId || fromUserId || fileExtension || after || before)
  if (!rawTerm && !hasStructuredFilter) {
    throw badRequest('api.search.query_or_filter_required', {}, 'q oder mindestens ein Filter ist erforderlich')
  }

  if (rawTerm && rawTerm.length < MIN_QUERY_LENGTH) {
    throw badRequest('api.search.query_too_short', {
      min_length: MIN_QUERY_LENGTH
    }, 'Suchanfrage ist zu kurz')
  }

  return {
    q: rawTerm,
    qLower: rawTerm.toLowerCase(),
    tab,
    fromUserId,
    channelId,
    after,
    before,
    fileExtension,
    documentTypes: resolveDocumentTypes(query, { tab, fromUserId }),
    requestedMatchMode,
    effectiveMatchMode: 'keyword',
    limit: normalizeLimit(query.$limit),
    ...normalizeCursor(query)
  }
}

function escapeLike(value) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function buildTypeClause(documentTypes) {
  if (!Array.isArray(documentTypes) || documentTypes.length === 0) {
    return { sql: 'TRUE', bindings: [] }
  }

  return {
    sql: `sd.document_type IN (${documentTypes.map(() => '?').join(', ')})`,
    bindings: documentTypes
  }
}

function buildScopeClauses(searchQuery, user, { enforceMemberAuthorFilter = false } = {}) {
  const clauses = []
  const bindings = []
  let accessScope = null
  const typeClause = buildTypeClause(searchQuery.documentTypes)

  clauses.push(typeClause.sql)
  bindings.push(...typeClause.bindings)

  if (searchQuery.channelId) {
    const meetingTypes = searchQuery.documentTypes.filter((type) => type.startsWith('meeting_'))
    if (meetingTypes.length > 0) {
      clauses.push(`(
        sd.source_channel_id = ?
        OR (
          sd.document_type IN (${meetingTypes.map(() => '?').join(', ')})
          AND COALESCE(sd.metadata->>'meeting_chat_channel_id', '') = ?
        )
      )`)
      bindings.push(searchQuery.channelId, ...meetingTypes, searchQuery.channelId)
    } else {
      clauses.push('sd.source_channel_id = ?')
      bindings.push(searchQuery.channelId)
    }
  }

  if (enforceMemberAuthorFilter && searchQuery.fromUserId) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM users search_author
      WHERE search_author.id = ?
        AND search_author.account_type = 'member'
    )`)
    bindings.push(searchQuery.fromUserId)
  }

  if (searchQuery.tab === 'meetings' && searchQuery.fromUserId) {
    clauses.push(`(
      (
        sd.document_type = 'message'
        AND sd.source_meeting_id IS NOT NULL
        AND sd.author_user_id = ?
      )
      OR (
        sd.document_type = 'meeting_transcript_segment'
        AND sd.author_user_id = ?
      )
    )`)
    bindings.push(searchQuery.fromUserId, searchQuery.fromUserId)
  } else if (searchQuery.fromUserId) {
    clauses.push('sd.author_user_id = ?')
    bindings.push(searchQuery.fromUserId)
  }

  if (searchQuery.after) {
    clauses.push('sd.created_at >= ?')
    bindings.push(searchQuery.after)
  }

  if (searchQuery.before) {
    clauses.push('sd.created_at <= ?')
    bindings.push(searchQuery.before)
  }

  if (searchQuery.fileExtension) {
    clauses.push('sd.file_extension = ?')
    bindings.push(searchQuery.fileExtension)
  }

  if (!user?.is_admin) {
    accessScope = buildAccessibleContentScopeSql(user?.id || null)
    clauses.push(`(
      (sd.source_meeting_id IS NULL AND sd.source_channel_id IN (SELECT channel_id FROM ${accessScope.channelCteName}))
      OR (sd.source_meeting_id IS NOT NULL AND sd.source_meeting_id IN (SELECT meeting_id FROM ${accessScope.meetingCteName}))
      OR (sd.source_meeting_id IS NULL AND sd.owner_user_id = ?)
    )`)
    bindings.push(user?.id || null)
  }

  if (searchQuery.beforeCreatedAt && searchQuery.beforeId) {
    clauses.push('(sd.created_at < ? OR (sd.created_at = ? AND sd.id < ?))')
    bindings.push(searchQuery.beforeCreatedAt, searchQuery.beforeCreatedAt, searchQuery.beforeId)
  }

  return {
    sql: clauses.join('\n      AND '),
    bindings,
    accessScope
  }
}

function buildSelectSql({ withSql = '', whereSql, matchConditionSql, includeRanking = false }) {
  const rankingSql = includeRanking
    ? `,
      ts_rank_cd(
        to_tsvector('simple', concat_ws(' ', coalesce(sd.title, ''), coalesce(sd.content_text, ''), coalesce(sd.file_name, ''))),
        websearch_to_tsquery('simple', ?)
      ) AS rank_score`
    : `,
      0::float AS rank_score`

  return `
    ${withSql}
    SELECT
      sd.id,
      sd.document_type,
      sd.document_id,
      sd.source_channel_id,
      sd.source_message_id,
      sd.source_meeting_id,
      sd.owner_user_id,
      sd.author_user_id,
      sd.title,
      sd.content_text,
      sd.file_name,
      sd.file_extension,
      sd.mime_type,
      sd.metadata,
      sd.created_at,
      sd.updated_at${rankingSql}
    FROM search_documents sd
    WHERE ${whereSql}
      AND ${matchConditionSql}
    ORDER BY sd.created_at DESC, sd.id DESC
    LIMIT ?
  `
}

function normalizeRawRows(result) {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.rows)) return result.rows
  return []
}

function buildNextCursor(rows, limit) {
  if (!Array.isArray(rows) || rows.length < limit || rows.length === 0) return null
  const last = rows[rows.length - 1]
  return {
    before_created_at: last.created_at,
    before_id: last.id
  }
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function buildSnippet(row, q) {
  const text = row.document_type === 'file'
    ? row.file_name || row.title || row.content_text || ''
    : row.content_text || row.title || row.file_name || ''

  if (!text) return ''
  if (!q) return text.slice(0, 160)

  const index = text.toLowerCase().indexOf(q.toLowerCase())
  if (index === -1) return text.slice(0, 160)
  const start = Math.max(index - 30, 0)
  const end = Math.min(index + 130, text.length)
  return text.slice(start, end)
}

function buildCanonicalNavigationTarget(row, metadata) {
  if ((row.document_type === 'message' || row.document_type === 'file')
    && row.source_meeting_id
    && metadata.navigation_target) {
    return metadata.navigation_target
  }

  if ((row.document_type === 'message' || row.document_type === 'file')
    && row.source_channel_id
    && row.source_message_id) {
    return `/channels/${encodeURIComponent(row.source_channel_id)}?message=${encodeURIComponent(row.source_message_id)}`
  }

  return metadata.navigation_target || null
}

function serializeRow(row, { q, requestedMatchMode, effectiveMatchMode, resultMode }) {
  const metadata = normalizeMetadata(row.metadata)
  const score = Number(row.rank_score || 0)

  return {
    id: row.id,
    document_id: row.document_id,
    document_type: row.document_type,
    match_mode: effectiveMatchMode,
    requested_match_mode: requestedMatchMode,
    result_mode: resultMode,
    score,
    title: row.title || row.file_name || null,
    snippet: buildSnippet(row, q),
    created_at: row.created_at,
    channel: row.source_channel_id
      ? {
          id: row.source_channel_id,
          name: metadata.channel_name || null,
          type: metadata.channel_type || null,
          purpose: metadata.channel_purpose || null
        }
      : null,
    author: row.author_user_id
      ? {
          id: row.author_user_id,
          display_name: metadata.author_display_name || null
        }
      : null,
    navigation_target: buildCanonicalNavigationTarget(row, metadata),
    preview: {
      source_message_id: row.source_message_id || null,
      source_meeting_id: row.source_meeting_id || null,
      file_name: row.file_name || null,
      file_extension: row.file_extension || null,
      mime_type: row.mime_type || null,
      meeting_title: metadata.meeting_title || null,
      meeting_chat_channel_id: metadata.meeting_chat_channel_id || null,
      meeting_chat_channel_name: metadata.meeting_chat_channel_name || null,
      meeting_started_at: metadata.meeting_started_at || null,
      meeting_ended_at: metadata.meeting_ended_at || null,
      transcript_artifact_id: metadata.transcript_artifact_id || null,
      transcript_start_ms: metadata.transcript_start_ms ?? null,
      transcript_end_ms: metadata.transcript_end_ms ?? null,
      artifact_type: metadata.artifact_type || null,
      size: metadata.size || null
    }
  }
}

export class SearchService {
  constructor(options) {
    this.options = options
  }

  async find(params = {}) {
    const db = this.options.Model
    const user = params.user || {}
    const searchQuery = normalizeSearchQuery(params.query)
    const enforceMemberAuthorFilter = !!params.provider

    if (searchQuery.channelId && !user?.is_admin) {
      await assertCanReadChannel(db, {
        channelId: searchQuery.channelId,
        user
      })
    }

    const { sql: whereSql, bindings: whereBindings, accessScope } = buildScopeClauses(searchQuery, user, {
      enforceMemberAuthorFilter
    })
    let rows = []
    let resultMode = 'filter'

    if (searchQuery.q) {
      const ftsSql = buildSelectSql({
        withSql: accessScope?.sql || '',
        whereSql,
        matchConditionSql: "to_tsvector('simple', concat_ws(' ', coalesce(sd.title, ''), coalesce(sd.content_text, ''), coalesce(sd.file_name, ''))) @@ websearch_to_tsquery('simple', ?)",
        includeRanking: true
      })

      rows = normalizeRawRows(await db.raw(ftsSql, [
        ...(accessScope?.bindings || []),
        searchQuery.q,
        ...whereBindings,
        searchQuery.q,
        searchQuery.limit
      ]))
      resultMode = 'fts'

      if (rows.length === 0) {
        const trigramSql = buildSelectSql({
          withSql: accessScope?.sql || '',
          whereSql,
          matchConditionSql: "lower(concat_ws(' ', coalesce(sd.title, ''), coalesce(sd.content_text, ''), coalesce(sd.file_name, ''))) LIKE ? ESCAPE '\\'",
          includeRanking: false
        })

        rows = normalizeRawRows(await db.raw(trigramSql, [
          ...(accessScope?.bindings || []),
          ...whereBindings,
          `%${escapeLike(searchQuery.qLower)}%`,
          searchQuery.limit
        ]))
        resultMode = 'trigram'
      }
    } else {
      const sql = buildSelectSql({
        withSql: accessScope?.sql || '',
        whereSql,
        matchConditionSql: 'TRUE',
        includeRanking: false
      })
      rows = normalizeRawRows(await db.raw(sql, [
        ...(accessScope?.bindings || []),
        ...whereBindings,
        searchQuery.limit
      ]))
    }

    const data = rows.map((row) => serializeRow(row, {
      q: searchQuery.q,
      requestedMatchMode: searchQuery.requestedMatchMode,
      effectiveMatchMode: searchQuery.effectiveMatchMode,
      resultMode
    }))

    return {
      total: data.length,
      limit: searchQuery.limit,
      requested_match_mode: searchQuery.requestedMatchMode,
      effective_match_mode: searchQuery.effectiveMatchMode,
      data,
      next_cursor: buildNextCursor(rows, searchQuery.limit)
    }
  }
}

export const search = (app) => {
  app.use('search', new SearchService({
    Model: app.get('postgresqlClient')
  }), {
    methods: ['find'],
    events: []
  })

  app.service('search').hooks({
    around: {
      all: [authenticate('jwt')]
    }
  })
}
