import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { createSchema } from './role-permissions.schema.js'

export class RolePermissionsService extends KnexService {}

export const rolePermissions = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'role_permissions',
    paginate: app.get('paginate')
  }

  app.use('role-permissions', new RolePermissionsService(options), {
    methods: ['find', 'get', 'create', 'remove'],
    events: []
  })

  const service = app.service('role-permissions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        checkPermission('manage_roles')
      ],
      get: [
        checkPermission('manage_roles')
      ],
      create: [
        validate(createSchema),
        checkPermission('manage_roles'),
        async (context) => {
          context.data.id = createId()
          return context
        }
      ],
      remove: [
        checkPermission('manage_roles')
      ]
    },
    after: {},
    error: {}
  })
}
