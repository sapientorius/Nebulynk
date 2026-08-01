import { authenticate } from '@feathersjs/authentication'
import { getOnlineUserIds, getConnectionForegroundState, updateConnectionPresenceState } from '../../presence.js'
import { badRequest, forbidden } from '../../lib/errors.js'

class PresenceService {
  constructor(app) {
    this.app = app
  }

  async find(params) {
    return {
      online: getOnlineUserIds()
    }
  }

  async patch(id, data, params) {
    if (params.provider !== 'socketio') {
      throw forbidden('api.presence.socket_only', {}, 'Presence updates are socket-only')
    }

    if (!params.connection) {
      throw badRequest('api.presence.connection_required', {}, 'Missing socket connection')
    }

    const payload = data && typeof data === 'object' ? data : {}
    const activeChannelId = payload.activeChannelId == null ? null : payload.activeChannelId
    const hasLastActivityAt = Object.prototype.hasOwnProperty.call(payload, 'lastActivityAt')

    if (activeChannelId !== null && typeof activeChannelId !== 'string') {
      throw badRequest('api.presence.active_channel_invalid', {}, 'activeChannelId must be a string or null')
    }

    if (hasLastActivityAt && typeof payload.lastActivityAt !== 'string') {
      throw badRequest('api.presence.last_activity_invalid', {}, 'lastActivityAt must be an ISO string')
    }

    if (hasLastActivityAt && Number.isNaN(new Date(payload.lastActivityAt).getTime())) {
      throw badRequest('api.presence.last_activity_invalid', {}, 'lastActivityAt must be an ISO string')
    }

    const state = await updateConnectionPresenceState(this.app, params.connection, {
      activeChannelId,
      isVisible: payload.isVisible === true,
      updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
      ...(hasLastActivityAt ? { lastActivityAt: payload.lastActivityAt } : {})
    })

    return {
      ...getConnectionForegroundState(params.connection),
      ...state
    }
  }
}

export const presence = (app) => {
  app.use('presence', new PresenceService(app), {
    methods: ['find', 'patch'],
    events: []
  })

  app.service('presence').hooks({
    around: {
      all: [authenticate('jwt')]
    }
  })
}
