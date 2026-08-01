import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { createSchema } from './user-roles.schema.js'

export class UserRolesService extends KnexService {}

export const userRoles = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'user_roles',
    paginate: app.get('paginate')
  }

  app.use('user-roles', new UserRolesService(options), {
    methods: ['find', 'get', 'create', 'remove'],
    events: []
  })

  const service = app.service('user-roles')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        checkPermission('manage_users')
      ],
      get: [
        checkPermission('manage_users')
      ],
      create: [
        validate(createSchema),
        checkPermission('manage_users'),
        async (context) => {
          context.data.id = createId()
          return context
        }
      ],
      remove: [
        checkPermission('manage_users')
      ]
    },
    after: {},
    error: {}
  })
}
