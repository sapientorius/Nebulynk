import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import {
  DEFAULT_SMTP_SETTINGS_ID,
  buildSmtpSettingsResponse,
  getEmailDeliveryStatus,
  invalidateSmtpTransporter,
  normalizeStoredSmtpPatch,
  sendTestEmail,
  testSmtpConnection
} from '../../email.js'
import { encryptSecret } from '../../lib/ai-secrets.js'
import { badRequest } from '../../lib/errors.js'
import { patchSchema, createSchema } from './smtp-settings.schema.js'

export class SmtpSettingsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  async find() {
    return buildSmtpSettingsResponse(this.app)
  }

  async patch(id, data) {
    const nowIso = new Date().toISOString()
    const patch = normalizeStoredSmtpPatch(data)

    await this.db.transaction(async (trx) => {
      const settingsRow = await trx('smtp_settings').where('id', DEFAULT_SMTP_SETTINGS_ID).first()
      const nextRow = {
        id: DEFAULT_SMTP_SETTINGS_ID,
        enabled: Object.prototype.hasOwnProperty.call(patch, 'enabled')
          ? patch.enabled
          : (settingsRow?.enabled ?? false),
        host: Object.prototype.hasOwnProperty.call(patch, 'host')
          ? patch.host
          : (settingsRow?.host ?? null),
        port: Object.prototype.hasOwnProperty.call(patch, 'port')
          ? patch.port
          : (settingsRow?.port ?? null),
        secure: Object.prototype.hasOwnProperty.call(patch, 'secure')
          ? patch.secure
          : (settingsRow?.secure ?? false),
        ignore_tls: Object.prototype.hasOwnProperty.call(patch, 'ignore_tls')
          ? patch.ignore_tls
          : (settingsRow?.ignore_tls ?? false),
        user: Object.prototype.hasOwnProperty.call(patch, 'user')
          ? patch.user
          : (settingsRow?.user ?? null),
        from_email: Object.prototype.hasOwnProperty.call(patch, 'from_email')
          ? patch.from_email
          : (settingsRow?.from_email ?? null),
        from_name: Object.prototype.hasOwnProperty.call(patch, 'from_name')
          ? patch.from_name
          : (settingsRow?.from_name ?? null),
        updated_at: nowIso
      }

      if (settingsRow) {
        await trx('smtp_settings').where('id', DEFAULT_SMTP_SETTINGS_ID).update(nextRow)
      } else {
        await trx('smtp_settings').insert({
          ...nextRow,
          created_at: nowIso
        })
      }

      if (Object.prototype.hasOwnProperty.call(patch, 'password')) {
        const password = patch.password
        const existingSecret = await trx('smtp_secrets').where('smtp_settings_id', DEFAULT_SMTP_SETTINGS_ID).first()

        if (!password) {
          if (existingSecret) {
            await trx('smtp_secrets').where('smtp_settings_id', DEFAULT_SMTP_SETTINGS_ID).del()
          }
        } else if (existingSecret) {
          await trx('smtp_secrets')
            .where('smtp_settings_id', DEFAULT_SMTP_SETTINGS_ID)
            .update({
              encrypted_password: encryptSecret(this.app, password),
              updated_at: nowIso
            })
        } else {
          await trx('smtp_secrets').insert({
            smtp_settings_id: DEFAULT_SMTP_SETTINGS_ID,
            encrypted_password: encryptSecret(this.app, password),
            created_at: nowIso,
            updated_at: nowIso
          })
        }
      }
    })

    invalidateSmtpTransporter()
    return this.find()
  }

  async create(data, params = {}) {
    if (data.action === 'test_connection') {
      return testSmtpConnection(this.app)
    }

    if (data.action === 'send_test_email') {
      const fallbackEmail = typeof params.user?.email === 'string'
        ? params.user.email.trim().toLowerCase()
        : ''
      const recipient = typeof data.to === 'string' && data.to.trim()
        ? data.to.trim().toLowerCase()
        : fallbackEmail

      if (!recipient) {
        throw badRequest(
          'api.smtp.test_recipient_required',
          {},
          'Eine Test-E-Mail-Adresse ist erforderlich'
        )
      }

      return sendTestEmail(this.app, { to: recipient })
    }

    throw badRequest('api.smtp.unknown_action', { action: data.action }, 'Unbekannte SMTP-Aktion')
  }
}

export const smtpSettings = (app) => {
  const service = new SmtpSettingsService({
    Model: app.get('postgresqlClient'),
    app
  })

  app.use('smtp-settings', service, {
    methods: ['find', 'create', 'patch'],
    events: []
  })

  app.service('smtp-settings').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      all: [checkPermission('manage_roles', 'manage_users')],
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    },
    after: {},
    error: {}
  })
}
