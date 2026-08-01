import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { badRequest } from '../../lib/errors.js'
import { createSchema, patchSchema } from './roles.schema.js'

export class RolesService extends KnexService {}

export const roles = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'roles',
    paginate: app.get('paginate')
  }

  app.use('roles', new RolesService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  const service = app.service('roles')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        checkPermission('manage_roles', 'manage_users', 'create_invites')
      ],
      get: [
        checkPermission('manage_roles', 'manage_users', 'create_invites')
      ],
      create: [
        validate(createSchema),
        checkPermission('manage_roles'),
        async (context) => {
          context.data.id = createId()
          context.data.is_system = false // User-created roles are never system roles
          return context
        }
      ],
      patch: [
        validate(patchSchema),
        checkPermission('manage_roles')
      ],
      remove: [
        checkPermission('manage_roles'),
        // Prevent deletion of system roles
        async (context) => {
          const db = context.app.get('postgresqlClient')
          const role = await db('roles').where('id', context.id).first()
          if (role && role.is_system) {
            throw badRequest(
              'api.roles.system_roles_cannot_be_deleted',
              {},
              'System-Rollen koennen nicht geloescht werden'
            )
          }
          return context
        }
      ]
    },
    after: {},
    error: {}
  })
}
