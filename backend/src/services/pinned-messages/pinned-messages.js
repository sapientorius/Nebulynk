import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { assertCanReadChannel } from '../../domains/meetings/content-access.js'
import { createSchema } from './pinned-messages.schema.js'

export class PinnedMessagesService extends KnexService {
  async find(params) {
    const db = this.options.Model
    const channelId = params.query?.channel_id

    if (!channelId) {
      return { data: [] }
    }

    const pins = await db('pinned_messages')
      .join('messages', 'pinned_messages.message_id', '=', 'messages.id')
      .join('users as author', 'messages.user_id', '=', 'author.id')
      .join('users as pinner', 'pinned_messages.pinned_by', '=', 'pinner.id')
      .where('pinned_messages.channel_id', channelId)
      .select(
        'pinned_messages.id',
        'pinned_messages.channel_id',
        'pinned_messages.message_id',
        'pinned_messages.pinned_by',
        'pinned_messages.created_at',
        'messages.content as message_content',
        'messages.created_at as message_created_at',
        'messages.user_id as message_user_id',
        'author.display_name as author_display_name',
        'author.avatar_url as author_avatar_url',
        'pinner.display_name as pinned_by_display_name'
      )
      .orderBy('pinned_messages.created_at', 'desc')

    return { data: pins }
  }
}

export const pinnedMessages = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'pinned_messages',
    paginate: false
  }

  app.use('pinned-messages', new PinnedMessagesService(options), {
    methods: ['find', 'create', 'remove'],
    events: []
  })

  const service = app.service('pinned-messages')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        async (context) => {
          if (!context.params.user) return context
          const channelId = context.params.query?.channel_id
          if (channelId) {
            await assertCanReadChannel(context.app.get('postgresqlClient'), {
              channelId,
              user: context.params.user
            })
          }
          return context
        }
      ],
      create: [
        validate(createSchema),
        checkPermission('pin_messages'),
        async (context) => {
          context.data.id = createId()
          context.data.pinned_by = context.params.user.id

          // Verify message belongs to the specified channel
          const db = context.app.get('postgresqlClient')
          const message = await db('messages').where('id', context.data.message_id).first()
          if (!message) {
            throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
          }
          if (message.channel_id !== context.data.channel_id) {
            throw badRequest(
              'api.pinned_messages.message_not_in_channel',
              {},
              'Nachricht gehoert nicht zu diesem Channel'
            )
          }

          // Check if already pinned
          const existing = await db('pinned_messages')
            .where({ channel_id: context.data.channel_id, message_id: context.data.message_id })
            .first()
          if (existing) {
            throw conflict('api.pinned_messages.message_already_pinned', {}, 'Nachricht ist bereits angepinnt')
          }

          return context
        }
      ],
      remove: [
        checkPermission('pin_messages'),
        async (context) => {
          // Load the pin before removing (for publishing)
          const db = context.app.get('postgresqlClient')
          const pin = await db('pinned_messages').where('id', context.id).first()
          if (!pin) throw notFound('api.pinned_messages.pin_not_found', {}, 'Pin nicht gefunden')
          context.params._channelId = pin.channel_id
          return context
        }
      ]
    },
    after: {
      create: [
        async (context) => {
          // Enrich with message + user data for real-time broadcast
          const db = context.app.get('postgresqlClient')
          const pin = await db('pinned_messages')
            .join('messages', 'pinned_messages.message_id', '=', 'messages.id')
            .join('users as author', 'messages.user_id', '=', 'author.id')
            .join('users as pinner', 'pinned_messages.pinned_by', '=', 'pinner.id')
            .where('pinned_messages.id', context.result.id)
            .select(
              'pinned_messages.id',
              'pinned_messages.channel_id',
              'pinned_messages.message_id',
              'pinned_messages.pinned_by',
              'pinned_messages.created_at',
              'messages.content as message_content',
              'messages.created_at as message_created_at',
              'messages.user_id as message_user_id',
              'author.display_name as author_display_name',
              'author.avatar_url as author_avatar_url',
              'pinner.display_name as pinned_by_display_name'
            )
            .first()
          if (pin) context.result = pin
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
