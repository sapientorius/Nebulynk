import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { setUserId } from '../../hooks/set-user-id.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { createSchema } from './reactions.schema.js'
import { notFound } from '../../lib/errors.js'

export class ReactionsService extends KnexService {
  async find(params) {
    const db = this.options.Model
    const messageId = params.query?.message_id

    if (!messageId) {
      return { data: [] }
    }

    const reactions = await db('reactions')
      .join('users', 'reactions.user_id', '=', 'users.id')
      .where('reactions.message_id', messageId)
      .select(
        'reactions.id',
        'reactions.message_id',
        'reactions.user_id',
        'reactions.emoji',
        'reactions.created_at',
        'users.display_name as user_display_name'
      )
      .orderBy('reactions.created_at', 'asc')

    // Group by emoji
    const grouped = {}
    for (const r of reactions) {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [] }
      }
      grouped[r.emoji].count++
      grouped[r.emoji].users.push({
        id: r.id,
        user_id: r.user_id,
        display_name: r.user_display_name
      })
    }

    return { data: Object.values(grouped) }
  }
}

export const reactions = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'reactions',
    paginate: false
  }

  app.use('reactions', new ReactionsService(options), {
    methods: ['find', 'create', 'remove'],
    events: []
  })

  const service = app.service('reactions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [
        validate(createSchema),
        setUserId(),
        // Resolve channel_id from message for membership/permission checks
        async (context) => {
          const db = context.app.get('postgresqlClient')
          const message = await db('messages').where('id', context.data.message_id).first()
          if (!message) {
            throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
          }
          context.data.channel_id = message.channel_id
          context.params.query = { ...context.params.query, channel_id: message.channel_id }
          return context
        },
        checkPermission('send_messages'),
        async (context) => {
          context.data.id = createId()
          // Remove channel_id from data (not a DB column)
          const channelId = context.data.channel_id
          delete context.data.channel_id
          // Store for after hook
          context.params._channelId = channelId
          return context
        }
      ],
      remove: [
        async (context) => {
          const db = context.app.get('postgresqlClient')
          const reaction = await db('reactions').where('id', context.id).first()
          if (!reaction) {
            throw notFound('api.reactions.reaction_not_found', {}, 'Reaktion nicht gefunden')
          }
          // Only own reactions can be removed (or manage_messages permission)
          if (reaction.user_id !== context.params.user.id) {
            await checkPermission('manage_messages')(context)
          }
          // Resolve channel_id for publishing
          const message = await db('messages').where('id', reaction.message_id).first()
          context.params._channelId = message?.channel_id
          return context
        }
      ]
    },
    after: {
      create: [
        async (context) => {
          context.result.channel_id = context.params._channelId
          return context
        }
      ],
      remove: [
        async (context) => {
          context.result.channel_id = context.params._channelId
          return context
        }
      ]
    },
    error: {}
  })
}
