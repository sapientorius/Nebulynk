import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { assertReminderAccess } from './access.js'
import { createSchema, patchSchema } from './message-reminders.schema.js'

const ACTIVE_STATUS = 'active'
const ALLOWED_FIND_STATUSES = new Set(['active', 'delivered', 'cancelled'])

function normalizeFutureDate(value, now) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw badRequest('api.message_reminders.invalid_remind_at', {}, 'Ungueltige Erinnerungszeit')
  }

  if (date.getTime() <= now.getTime()) {
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
    this.clock = options.clock || (() => new Date())
  }

  get db() {
    return this.options.Model
  }

  async assertReadableMessage(messageId, params = {}, db = this.db, now = this.clock()) {
    if (!messageId || typeof messageId !== 'string') {
      throw badRequest('api.message_reminders.message_id_required', {}, 'message_id ist erforderlich')
    }

    const { message } = await assertReminderAccess(db, { messageId, userId: params.user?.id, now })
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
    return this.db.transaction(async (trx) => {
      const userId = params.user.id
      const time = this.clock()
      const remindAt = normalizeFutureDate(data.remind_at, time)
      const message = await this.assertReadableMessage(data.message_id, params, trx, time)
      const now = time.toISOString()

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

      const [result] = await trx('message_reminders').insert(reminder)
        .onConflict(trx.raw("(user_id, message_id) WHERE status = 'active'"))
        .merge({ channel_id: message.channel_id, remind_at: remindAt, updated_at: now })
        .returning('*')
      return result
    })
  }

  async patch(id, data, params = {}) {
    if (!id) {
      throw badRequest('api.message_reminders.id_required', {}, 'Reminder-ID ist erforderlich')
    }

    return this.db.transaction(async (trx) => {
      const userId = params.user.id
      const time = this.clock()
      const remindAt = normalizeFutureDate(data.remind_at, time)
      const existing = await trx('message_reminders').where('id', id).forUpdate().first()
      if (!existing || existing.user_id !== userId || existing.status !== ACTIVE_STATUS) {
        throw notFound('api.message_reminders.not_found', {}, 'Erinnerung nicht gefunden')
      }

      const message = await this.assertReadableMessage(existing.message_id, params, trx, time)
      const now = time.toISOString()
      const patch = {
        channel_id: message.channel_id,
        remind_at: remindAt,
        updated_at: now
      }

      await trx('message_reminders').where('id', id).update(patch)
      return { ...existing, ...patch }
    })
  }

  async remove(id, params = {}) {
    if (!id) {
      throw badRequest('api.message_reminders.id_required', {}, 'Reminder-ID ist erforderlich')
    }

    return this.db.transaction(async (trx) => {
      const userId = params.user.id
      const existing = await trx('message_reminders').where('id', id).forUpdate().first()
      if (!existing || existing.user_id !== userId || existing.status !== ACTIVE_STATUS) {
        throw notFound('api.message_reminders.not_found', {}, 'Erinnerung nicht gefunden')
      }

      const time = this.clock()
      await this.assertReadableMessage(existing.message_id, params, trx, time)

      const now = time.toISOString()
      const patch = {
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now
      }

      await trx('message_reminders').where('id', id).update(patch)
      return { ...existing, ...patch }
    })
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
