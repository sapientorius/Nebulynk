import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { patchSchema } from './notifications.schema.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'

const ALLOWED_NOTIFICATION_TYPES = new Set(['mention', 'mention_all', 'dm_message', 'meeting_invite', 'message_reminder'])

function normalizeBoolean(value) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return null
}

function normalizeStringArrayQueryValue(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return Object.values(value)
  if (value === undefined) return undefined
  return [value]
}

function normalizeScopedPatchQuery(query = {}) {
  const normalized = {}
  const rawBatchMessageIds = query.message_ids ?? query['message_ids[]']

  if (query.is_read !== undefined) {
    const isRead = normalizeBoolean(query.is_read)
    if (isRead === null) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/query/is_read', message: 'must be boolean-like' }]
      }, 'Validierungsfehler')
    }
    normalized.is_read = isRead
  }

  if (query.message_id !== undefined) {
    if (typeof query.message_id !== 'string' || !query.message_id.trim()) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/query/message_id', message: 'must be non-empty string' }]
      }, 'Validierungsfehler')
    }
    normalized.message_id = query.message_id.trim()
  }

  if (rawBatchMessageIds !== undefined) {
    const rawMessageIds = normalizeStringArrayQueryValue(rawBatchMessageIds)
    const messageIds = rawMessageIds
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)

    if (messageIds.length === 0 || messageIds.length !== rawMessageIds.length) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/query/message_ids', message: 'must be an array of non-empty strings' }]
      }, 'Validierungsfehler')
    }

    normalized.message_ids = [...new Set(messageIds)]
  }

  if (normalized.message_id && normalized.message_ids?.length) {
    throw badRequest('api.validation.failed', {
      errors: [{ field: '/query/message_ids', message: 'must not be combined with message_id' }]
    }, 'Validierungsfehler')
  }

  if (query.meeting_id !== undefined) {
    if (typeof query.meeting_id !== 'string' || !query.meeting_id.trim()) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/query/meeting_id', message: 'must be non-empty string' }]
      }, 'Validierungsfehler')
    }
    normalized.meeting_id = query.meeting_id.trim()
  }

  if (query.type !== undefined) {
    if (typeof query.type !== 'string' || !ALLOWED_NOTIFICATION_TYPES.has(query.type)) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/query/type', message: 'must be one of the allowed notification types' }]
      }, 'Validierungsfehler')
    }
    normalized.type = query.type
  }

  return normalized
}

export class NotificationsService extends KnexService {
  async find(params) {
    const db = this.options.Model
    const userId = params.user.id

    const limit = Math.min(params.query?.$limit || 50, 100)
    const isReadFilter = params.query?.is_read

    const query = db('notifications')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)

    if (isReadFilter !== undefined) {
      query.where('is_read', isReadFilter === 'true' || isReadFilter === true)
    }

    const [data, unreadCountRow] = await Promise.all([
      query,
      db('notifications')
        .where('user_id', userId)
        .where('is_read', false)
        .count({ count: '*' })
        .first()
    ])

    return {
      data,
      total: data.length,
      limit,
      unread_total: Number(unreadCountRow?.count || 0)
    }
  }

  async patch(id, data, params) {
    const db = this.options.Model
    const userId = params.user.id

    if (id) {
      // Single patch — verify ownership
      const existing = await db('notifications').where('id', id).first()
      if (!existing) throw notFound('api.notifications.notification_not_found', {}, 'Notification nicht gefunden')
      if (existing.user_id !== userId) throw forbidden('api.notifications.access_denied', {}, 'Access denied')
      await db('notifications').where('id', id).update({ is_read: data.is_read })
      return { ...existing, ...data }
    }

    // Bulk patch: mark all unread as read for this user
    const query = db('notifications').where('user_id', userId)
    const scopedQuery = normalizeScopedPatchQuery(params.query)

    if (scopedQuery.is_read !== undefined) {
      query.where('is_read', scopedQuery.is_read)
    }
    if (scopedQuery.message_id) {
      query.where('message_id', scopedQuery.message_id)
    }
    if (scopedQuery.message_ids?.length) {
      query.whereIn('message_id', scopedQuery.message_ids)
    }
    if (scopedQuery.meeting_id) {
      query.where('meeting_id', scopedQuery.meeting_id)
    }
    if (scopedQuery.type) {
      query.where('type', scopedQuery.type)
    }

    const updated = await query.update({ is_read: data.is_read })
    return { updated }
  }
}

export const notifications = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'notifications',
    paginate: false,
    multi: ['patch']
  }

  app.use('notifications', new NotificationsService(options), {
    methods: ['find', 'patch'],
    events: ['created']
  })

  app.service('notifications').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      patch: [validate(patchSchema)]
    }
  })
}
