import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { createSchema, patchSchema } from './platform.schema.js'
import { PlatformRepository } from '../../domains/platform/repository.js'
import { PlatformDomainService } from '../../domains/platform/service.js'
import { KlipySettings } from '../../lib/klipy-settings.js'

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
  const repository = new PlatformRepository(app.get('postgresqlClient'))
  const configuredEnv = app.get('env')
  const klipySettings = new KlipySettings({
    repository,
    app,
    env: configuredEnv && typeof configuredEnv === 'object' ? configuredEnv : process.env
  })
  app.set('klipySettings', klipySettings)

  const domainService = new PlatformDomainService({
    repository,
    usersService: app.service('users'),
    klipySettings
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
