import { authenticate } from '@feathersjs/authentication'
import { badRequest } from '../../lib/errors.js'
import {
  assertCanReadChannel,
  buildChannelReadAccessSql
} from '../../domains/meetings/content-access.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MIN_QUERY_LENGTH = 3
const SNIPPET_LENGTH = 160

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
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
    throw badRequest('api.message_search.cursor_pair_required', {}, 'before_created_at und before_id muessen gemeinsam gesetzt werden')
  }

  const timestamp = new Date(beforeCreatedAt).getTime()
  if (Number.isNaN(timestamp)) {
    throw badRequest('api.validation.failed', {
      errors: [{ field: '/query/before_created_at', message: 'must be date-time' }]
    }, 'Validierungsfehler')
  }

  return {
    beforeCreatedAt: new Date(timestamp).toISOString(),
    beforeId
  }
}

export function normalizeSearchQuery(query = {}) {
  const rawTerm = typeof query.q === 'string' ? query.q.trim() : ''
  if (!rawTerm) {
    throw badRequest('api.message_search.query_required', {}, 'q ist erforderlich')
  }

  if (rawTerm.length < MIN_QUERY_LENGTH) {
    throw badRequest('api.message_search.query_too_short', {
      min_length: MIN_QUERY_LENGTH
    }, 'Suchanfrage ist zu kurz')
  }

  const channelId = typeof query.channel_id === 'string' && query.channel_id.trim()
    ? query.channel_id.trim()
    : null

  return {
    q: rawTerm,
    qLower: rawTerm.toLowerCase(),
    channelId,
    limit: normalizeLimit(query.$limit),
    ...normalizeCursor(query)
  }
}

function escapeLike(value) {
  return value.replace(/[%_\\]/g, '\\$&')
}

function buildScopeClauses(searchQuery, user) {
  const clauses = [
    'm.deleted_at IS NULL',
    "m.type <> 'system'",
    "NULLIF(BTRIM(COALESCE(m.content, '')), '') IS NOT NULL"
  ]
  const bindings = []

  if (searchQuery.channelId) {
    clauses.push('m.channel_id = ?')
    bindings.push(searchQuery.channelId)
  }

  if (!user?.is_admin) {
    const channelAccess = buildChannelReadAccessSql('m.channel_id', user?.id || null)
    clauses.push(channelAccess.sql)
    bindings.push(...channelAccess.bindings)
  }

  if (searchQuery.beforeCreatedAt && searchQuery.beforeId) {
    clauses.push('(m.created_at < ? OR (m.created_at = ? AND m.id < ?))')
    bindings.push(searchQuery.beforeCreatedAt, searchQuery.beforeCreatedAt, searchQuery.beforeId)
  }

  return {
    sql: clauses.join('\n      AND '),
    bindings
  }
}

function buildSearchSql({ whereSql, matchConditionSql, matchMode }) {
  return `
    SELECT
      m.id,
      m.channel_id,
      m.user_id,
      m.created_at,
      m.type,
      u.display_name AS user_display_name,
      c.name AS channel_name,
      LEFT(m.content, ${SNIPPET_LENGTH}) AS snippet,
      '${matchMode}' AS match_mode
    FROM messages m
    JOIN users u ON u.id = m.user_id
    JOIN channels c ON c.id = m.channel_id
    WHERE ${whereSql}
      AND ${matchConditionSql}
    ORDER BY m.created_at DESC, m.id DESC
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

export class MessageSearchService {
  constructor(options) {
    this.options = options
  }

  async find(params = {}) {
    const db = this.options.Model
    const user = params.user || {}
    const searchQuery = normalizeSearchQuery(params.query)

    if (searchQuery.channelId && !user?.is_admin) {
      await assertCanReadChannel(db, {
        channelId: searchQuery.channelId,
        user
      })
    }

    const { sql: whereSql, bindings: whereBindings } = buildScopeClauses(searchQuery, user)

    const ftsSql = buildSearchSql({
      whereSql,
      matchConditionSql: "to_tsvector('simple', m.content) @@ websearch_to_tsquery('simple', ?)",
      matchMode: 'fts'
    })
    const ftsRows = normalizeRawRows(await db.raw(ftsSql, [
      ...whereBindings,
      searchQuery.q,
      searchQuery.limit
    ]))

    let data = ftsRows
    if (data.length === 0) {
      const trigramSql = buildSearchSql({
        whereSql,
        matchConditionSql: 'lower(m.content) LIKE ? ESCAPE \'\\\'',
        matchMode: 'trigram'
      })
      data = normalizeRawRows(await db.raw(trigramSql, [
        ...whereBindings,
        `%${escapeLike(searchQuery.qLower)}%`,
        searchQuery.limit
      ]))
    }

    return {
      total: data.length,
      limit: searchQuery.limit,
      data,
      next_cursor: buildNextCursor(data, searchQuery.limit)
    }
  }
}

export const messageSearch = (app) => {
  app.use('message-search', new MessageSearchService({
    Model: app.get('postgresqlClient')
  }), {
    methods: ['find'],
    events: []
  })

  app.service('message-search').hooks({
    around: {
      all: [authenticate('jwt')]
    }
  })
}
