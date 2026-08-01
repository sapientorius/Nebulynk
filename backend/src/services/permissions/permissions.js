import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'

export class PermissionsService extends KnexService {}

export const permissions = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'permissions',
    paginate: app.get('paginate')
  }

  app.use('permissions', new PermissionsService(options), {
    methods: ['find', 'get'],
    events: []
  })

  const service = app.service('permissions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [checkPermission('manage_roles')],
      get: [checkPermission('manage_roles')]
    },
    after: {},
    error: {}
  })
}
