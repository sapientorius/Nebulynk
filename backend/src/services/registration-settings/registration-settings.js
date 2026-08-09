import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { getEmailDeliveryStatus } from '../../email.js'
import { badRequest } from '../../lib/errors.js'
import {
  SELF_REGISTRATION_SETTING_KEYS,
  getSelfRegistrationSettings,
  normalizeAllowedDomain,
  normalizeAllowedDomains,
  setPlatformSetting
} from '../../lib/self-registration.js'
import { validate } from '../../schemas/validators.js'
import { patchSchema } from './registration-settings.schema.js'

function normalizeDomainPatch(value) {
  const domains = Array.isArray(value) ? value : []
  if (domains.some((domain) => !normalizeAllowedDomain(domain))) {
    throw badRequest(
      'api.self_registration.invalid_allowed_domain',
      {},
      'Eine oder mehrere erlaubte Domains sind ungueltig'
    )
  }
  return normalizeAllowedDomains(domains)
}

export class RegistrationSettingsService {
  constructor(app) {
    this.app = app
    this.db = app.get('postgresqlClient')
  }

  async find() {
    const [settings, delivery] = await Promise.all([
      getSelfRegistrationSettings(this.db),
      getEmailDeliveryStatus(this.app)
    ])

    return {
      enabled: settings.enabled,
      allowed_domains: settings.allowedDomains,
      requires_admin_approval: settings.requiresAdminApproval,
      smtp_configured: delivery.configured,
      smtp_source: delivery.source
    }
  }

  async patch(_id, data) {
    const allowedDomains = Object.prototype.hasOwnProperty.call(data, 'allowed_domains')
      ? normalizeDomainPatch(data.allowed_domains)
      : null

    await this.db.transaction(async (trx) => {
      if (Object.prototype.hasOwnProperty.call(data, 'enabled')) {
        await setPlatformSetting(trx, SELF_REGISTRATION_SETTING_KEYS.enabled, data.enabled ? 'true' : 'false')
      }
      if (allowedDomains) {
        await setPlatformSetting(trx, SELF_REGISTRATION_SETTING_KEYS.allowedDomains, JSON.stringify(allowedDomains))
      }
      if (Object.prototype.hasOwnProperty.call(data, 'requires_admin_approval')) {
        await setPlatformSetting(
          trx,
          SELF_REGISTRATION_SETTING_KEYS.requiresAdminApproval,
          data.requires_admin_approval ? 'true' : 'false'
        )
      }
    })
    return this.find()
  }
}

export const registrationSettings = (app) => {
  app.use('registration-settings', new RegistrationSettingsService(app), {
    methods: ['find', 'patch'],
    events: []
  })

  app.service('registration-settings').hooks({
    around: { all: [authenticate('jwt')] },
    before: {
      all: [checkPermission('manage_users')],
      patch: [validate(patchSchema)]
    }
  })
}
