import { authenticate } from '@feathersjs/authentication'
import { resolveUserPermissions } from '../../hooks/check-permission.js'

class MyPermissionsService {
  constructor(app) {
    this.app = app
  }

  async find(params) {
    const userId = params.user.id
    const channelId = params.query?.channel_id || null

    return resolveUserPermissions(this.app, userId, channelId)
  }
}

export const myPermissions = (app) => {
  app.use('my-permissions', new MyPermissionsService(app), {
    methods: ['find'],
    events: []
  })

  const service = app.service('my-permissions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {},
    after: {},
    error: {}
  })
}
