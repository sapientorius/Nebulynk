import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { getConfiguredPasswordStrengthPolicy, serializePasswordStrengthPolicy } from '../../lib/password-policy.js'
import { setPlatformSetting } from '../../lib/self-registration.js'
import { validate } from '../../schemas/validators.js'
import { patchSchema } from './security-settings.schema.js'

export class SecuritySettingsService {
  constructor(app) {
    this.app = app
    this.db = app.get('postgresqlClient')
  }

  async find() {
    const policy = await getConfiguredPasswordStrengthPolicy(this.db)
    return serializePasswordStrengthPolicy(policy.level)
  }

  async patch(_id, data) {
    await setPlatformSetting(this.db, 'password_strength_level', data.password_strength_level)
    return this.find()
  }
}

export const securitySettings = (app) => {
  app.use('security-settings', new SecuritySettingsService(app), {
    methods: ['find', 'patch'],
    events: []
  })

  app.service('security-settings').hooks({
    around: { all: [authenticate('jwt')] },
    before: {
      all: [checkPermission('manage_users')],
      patch: [validate(patchSchema)]
    }
  })
}
