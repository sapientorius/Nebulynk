import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { patchSchema } from './channel-read-state.schema.js'
import { badRequest, forbidden } from '../../lib/errors.js'

function normalizeReadTimestamp(lastReadAt) {
  const timestamp = new Date(lastReadAt).getTime()
  if (Number.isNaN(timestamp)) return null

  // Postgres timestamps can retain finer precision than the client round-trips.
  // Bump the stored watermark slightly so the just-seen latest message does not
  // reappear as unread after a reload due to sub-millisecond truncation.
  return new Date(timestamp + 1).toISOString()
}

export class ChannelReadStateService {
  constructor(options) {
    this.options = options
  }

  async patch(id, data, params) {
    if (id !== null) {
      throw badRequest('api.channel_read_state.unsupported_target', {}, 'Nur Channel-Read-State Bulk-Patch wird unterstuetzt')
    }

    const db = this.options.Model
    const userId = params.user?.id
    const channelId = data.channel_id
    const requestedLastReadAt = data.last_read_at

    const membership = await db('channel_members')
      .where({
        channel_id: channelId,
        user_id: userId
      })
      .first()

    if (!membership) {
      throw forbidden(
        'api.channels.membership_required',
        { channel_id: channelId },
        'You are not a member of this channel'
      )
    }

    const lastReadAt = normalizeReadTimestamp(requestedLastReadAt)
    const incomingTimestamp = new Date(lastReadAt).getTime()
    const existingTimestamp = membership.last_read_at ? new Date(membership.last_read_at).getTime() : null

    if (Number.isNaN(incomingTimestamp)) {
      throw badRequest('api.validation.failed', {
        errors: [{ field: '/last_read_at', message: 'must be date-time' }]
      }, 'Validierungsfehler')
    }

    if (existingTimestamp !== null && incomingTimestamp <= existingTimestamp) {
      return {
        channel_id: channelId,
        last_read_at: membership.last_read_at,
        updated: false
      }
    }

    await db('channel_members')
      .where({
        channel_id: channelId,
        user_id: userId
      })
      .where((builder) => {
        builder.whereNull('last_read_at').orWhere('last_read_at', '<', lastReadAt)
      })
      .update({ last_read_at: lastReadAt })

    return {
      channel_id: channelId,
      last_read_at: lastReadAt,
      updated: true
    }
  }
}

export const channelReadState = (app) => {
  app.use('channel-read-state', new ChannelReadStateService({
    Model: app.get('postgresqlClient')
  }), {
    methods: ['patch'],
    events: []
  })

  app.service('channel-read-state').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      patch: [validate(patchSchema)]
    }
  })
}
