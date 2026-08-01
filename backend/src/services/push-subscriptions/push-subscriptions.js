import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import webPush from 'web-push'
import { validate } from '../../schemas/validators.js'
import { createSchema } from './push-subscriptions.schema.js'
import { forbidden, notFound } from '../../lib/errors.js'

let webPushInitialized = false

export function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'

  if (!publicKey || !privateKey) {
    return
  }

  webPush.setVapidDetails(subject, publicKey, privateKey)
  webPushInitialized = true
}

export async function sendPushToUser(app, userId, payload) {
  if (!webPushInitialized) return

  const db = app.get('postgresqlClient')
  const subs = await db('push_subscriptions').where('user_id', userId)

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    } catch (err) {
      // Remove expired/invalid subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db('push_subscriptions').where('id', sub.id).delete()
      }
    }
  }
}

export class PushSubscriptionsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  async find(params = {}) {
    return this.db('push_subscriptions')
      .where(params.query || {})
      .select('*')
  }

  async create(data) {
    await this.db('push_subscriptions').insert(data)
    return data
  }

  async remove(id) {
    const existing = await this.db('push_subscriptions').where('id', id).first()
    if (!existing) {
      throw notFound(
        'api.push_subscriptions.not_found',
        { id },
        'Push subscription not found'
      )
    }

    await this.db('push_subscriptions').where('id', id).delete()
    return existing
  }
}

export const pushSubscriptions = (app) => {
  initWebPush()

  const options = {
    Model: app.get('postgresqlClient'),
    name: 'push_subscriptions'
  }

  app.use('push-subscriptions', new PushSubscriptionsService(options), {
    methods: ['find', 'create', 'remove'],
    events: []
  })

  const service = app.service('push-subscriptions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        async (context) => {
          // Only return own subscriptions
          context.params.query = { ...context.params.query, user_id: context.params.user.id }
          return context
        }
      ],
      create: [
        validate(createSchema),
        async (context) => {
          context.data.id = createId()
          context.data.user_id = context.params.user.id

          // Upsert: remove existing subscription with same endpoint first
          const db = context.app.get('postgresqlClient')
          await db('push_subscriptions').where('endpoint', context.data.endpoint).delete()

          return context
        }
      ],
      remove: [
        async (context) => {
          // Verify ownership before delete
          const db = context.app.get('postgresqlClient')
          const sub = await db('push_subscriptions').where('id', context.id).first()
          if (sub && sub.user_id !== context.params.user.id) {
            throw forbidden('api.push_subscriptions.access_denied', {}, 'Access denied')
          }
          return context
        }
      ]
    }
  })
}
