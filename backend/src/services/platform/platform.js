import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { createSchema, patchSchema } from './platform.schema.js'
import { PlatformRepository } from '../../domains/platform/repository.js'
import { PlatformDomainService } from '../../domains/platform/service.js'

class PlatformService {
  constructor(options) {
    this.domainService = options.domainService
  }

  async find() {
    return this.domainService.findSettings()
  }

  async create(data) {
    return this.domainService.setupPlatform(data)
  }

  async patch(id, data) {
    return this.domainService.updateSettings(data)
  }
}

export const platform = (app) => {
  const domainService = new PlatformDomainService({
    repository: new PlatformRepository(app.get('postgresqlClient')),
    usersService: app.service('users')
  })

  app.use('platform', new PlatformService({ domainService }), {
    methods: ['find', 'create', 'patch'],
    events: []
  })

  // No authentication required for platform service (setup must work without auth)
  app.service('platform').hooks({
    around: { all: [] },
    before: {
      create: [validate(createSchema)],
      patch: [authenticate('jwt'), checkPermission('manage_roles', 'manage_users'), validate(patchSchema)]
    },
    after: {},
    error: {}
  })
}
