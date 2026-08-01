import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { createSchema, patchSchema } from './message-reminders.schema.js'

const ACTIVE_STATUS = 'active'
const ALLOWED_FIND_STATUSES = new Set(['active', 'delivered', 'cancelled'])

function normalizeFutureDate(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw badRequest('api.message_reminders.invalid_remind_at', {}, 'Ungueltige Erinnerungszeit')
  }

  if (date.getTime() <= Date.now()) {
    throw badRequest('api.message_reminders.remind_at_must_be_future', {}, 'Erinnerungszeit muss in der Zukunft liegen')
  }

  return date.toISOString()
}

function sanitizeStatus(value) {
  if (value === undefined || value === null || value === '') return ACTIVE_STATUS
  if (typeof value !== 'string' || !ALLOWED_FIND_STATUSES.has(value)) {
    throw badRequest('api.message_reminders.invalid_status', {}, 'Ungueltiger Erinnerungsstatus')
  }
  return value
}

export class MessageRemindersService {
  constructor(options) {
    this.options = options
    this.generateId = options.generateId || createId
  }

  get db() {
    return this.options.Model
  }

  async assertReadableMessage(messageId, params = {}) {
    if (!messageId || typeof messageId !== 'string') {
      throw badRequest('api.message_reminders.message_id_required', {}, 'message_id ist erforderlich')
    }

    const message = await this.db('messages')
      .where('id', messageId)
      .whereNull('deleted_at')
      .first()

    if (!message) {
      throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
    }

    const user = params.user
    if (!user?.id) {
      throw forbidden('api.channels.membership_required', { channel_id: message.channel_id }, 'You are not a member of this channel')
    }

    if (user.is_admin) return message

    const membership = await this.db('channel_members')
      .where({ channel_id: message.channel_id, user_id: user.id })
      .first()

    if (!membership) {
      throw forbidden('api.channels.membership_required', { channel_id: message.channel_id }, 'You are not a member of this channel')
    }

    return message
  }

  async find(params = {}) {
    const userId = params.user.id
    const status = sanitizeStatus(params.query?.status)
    const messageId = typeof params.query?.message_id === 'string'
      ? params.query.message_id.trim()
      : ''

    if (messageId) {
      await this.assertReadableMessage(messageId, params)
    }

    const query = this.db('message_reminders')
      .where('user_id', userId)
      .where('status', status)
      .orderBy('remind_at', 'asc')

    if (messageId) {
      query.where('message_id', messageId)
    }

    return query
  }

  async create(data, params = {}) {
    const userId = params.user.id
    const remindAt = normalizeFutureDate(data.remind_at)
    const message = await this.assertReadableMessage(data.message_id, params)
    const now = new Date().toISOString()

    const existing = await this.db('message_reminders')
      .where({ user_id: userId, message_id: message.id, status: ACTIVE_STATUS })
      .first()

    if (existing) {
      await this.db('message_reminders')
        .where('id', existing.id)
        .update({
          channel_id: message.channel_id,
          remind_at: remindAt,
          updated_at: now
        })

      return {
        ...existing,
        channel_id: message.channel_id,
        remind_at: remindAt,
        updated_at: now
      }
    }

    const reminder = {
      id: this.generateId(),
      user_id: userId,
      message_id: message.id,
      channel_id: message.channel_id,
      remind_at: remindAt,
      status: ACTIVE_STATUS,
      notification_id: null,
      delivered_at: null,
      cancelled_at: null,
      created_at: now,
      updated_at: now
    }

    await this.db('message_reminders').insert(reminder)
    return reminder
  }

  async patch(id, data, params = {}) {
    if (!id) {
      throw badRequest('api.message_reminders.id_required', {}, 'Reminder-ID ist erforderlich')
    }

    const userId = params.user.id
    const remindAt = normalizeFutureDate(data.remind_at)
    const existing = await this.db('message_reminders').where('id', id).first()
    if (!existing || existing.user_id !== userId || existing.status !== ACTIVE_STATUS) {
      throw notFound('api.message_reminders.not_found', {}, 'Erinnerung nicht gefunden')
    }

    const message = await this.assertReadableMessage(existing.message_id, params)
    const now = new Date().toISOString()
    const patch = {
      channel_id: message.channel_id,
      remind_at: remindAt,
      updated_at: now
    }

    await this.db('message_reminders').where('id', id).update(patch)
    return { ...existing, ...patch }
  }

  async remove(id, params = {}) {
    if (!id) {
      throw badRequest('api.message_reminders.id_required', {}, 'Reminder-ID ist erforderlich')
    }

    const userId = params.user.id
    const existing = await this.db('message_reminders').where('id', id).first()
    if (!existing || existing.user_id !== userId || existing.status !== ACTIVE_STATUS) {
      throw notFound('api.message_reminders.not_found', {}, 'Erinnerung nicht gefunden')
    }

    await this.assertReadableMessage(existing.message_id, params)

    const now = new Date().toISOString()
    const patch = {
      status: 'cancelled',
      cancelled_at: now,
      updated_at: now
    }

    await this.db('message_reminders').where('id', id).update(patch)
    return { ...existing, ...patch }
  }
}

export const messageReminders = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'message_reminders'
  }

  app.use('message-reminders', new MessageRemindersService(options), {
    methods: ['find', 'create', 'patch', 'remove'],
    events: []
  })

  app.service('message-reminders').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    }
  })
}
