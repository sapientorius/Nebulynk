import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { getEmailDeliveryStatus, sendAccountActivatedEmail } from '../../email.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { broadcastPendingRegistrationSummary } from '../../lib/registration-pending-alerts.js'
import {
  REGISTRATION_STATUS,
  assignDefaultMemberRole,
  getPlatformDefaultLocale,
  isRegistrationStatusPending
} from '../../lib/self-registration.js'
import { validate } from '../../schemas/validators.js'
import { patchSchema } from './pending-registrations.schema.js'

const PENDING_STATUSES = [
  REGISTRATION_STATUS.pendingEmailVerification,
  REGISTRATION_STATUS.pendingAdminApproval
]

function serializePendingRegistration(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    registration_status: user.registration_status,
    created_at: user.created_at,
    email_verified_at: user.email_verified_at || null
  }
}

export class PendingRegistrationsService {
  constructor(app, {
    now = () => new Date(),
    sendActivationEmail = sendAccountActivatedEmail
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.now = now
    this.sendActivationEmail = sendActivationEmail
  }

  async find() {
    const rows = await this.db('users')
      .whereIn('registration_status', PENDING_STATUSES)
      .orderBy('created_at', 'asc')
      .select('id', 'email', 'display_name', 'registration_status', 'created_at', 'email_verified_at')

    return rows.map(serializePendingRegistration)
  }

  async patch(id, data) {
    if (data.action !== 'confirm') {
      throw badRequest('api.pending_registrations.unknown_action', {}, 'Unbekannte Registrierungsaktion')
    }

    const now = this.now()
    const nowIso = now.toISOString()
    const activatedUser = await this.db.transaction(async (trx) => {
      const user = await trx('users').where('id', id).forUpdate().first()
      if (!user || !isRegistrationStatusPending(user.registration_status)) {
        throw notFound('api.pending_registrations.not_found', {}, 'Ausstehende Anmeldung nicht gefunden')
      }

      await trx('users').where('id', user.id).update({
        is_verified: true,
        email_verified_at: user.email_verified_at || nowIso,
        registration_status: REGISTRATION_STATUS.active,
        registration_pending_reason: null,
        updated_at: nowIso
      })
      await trx('registration_email_tokens')
        .where('user_id', user.id)
        .whereNull('consumed_at')
        .update({
          consumed_at: nowIso,
          updated_at: nowIso
        })
      await assignDefaultMemberRole(trx, user.id)

      return {
        ...user,
        registration_status: REGISTRATION_STATUS.active,
        is_verified: true,
        email_verified_at: user.email_verified_at || nowIso
      }
    })

    await broadcastPendingRegistrationSummary(this.app)

    const locale = activatedUser.preferred_locale || await getPlatformDefaultLocale(this.db)
    let emailResult
    try {
      emailResult = await this.sendActivationEmail(this.app, {
        email: activatedUser.email,
        locale
      })
    } catch (error) {
      emailResult = {
        ok: false,
        errorCode: 'api.smtp.delivery_failed',
        errorMessage: error?.message || 'Aktivierungs-E-Mail konnte nicht versendet werden'
      }
    }

    let delivery = { configured: false }
    try {
      delivery = await getEmailDeliveryStatus(this.app)
    } catch {
      // The account has already been activated. Report the email failure instead of rolling it back.
    }

    return {
      ok: true,
      registration: serializePendingRegistration(activatedUser),
      email_sent: emailResult?.ok === true,
      email_configured: delivery.configured,
      email_error_code: emailResult?.errorCode || null,
      email_error_message: emailResult?.errorMessage || null
    }
  }

  async remove(id) {
    const user = await this.db('users').where('id', id).first()
    if (!user || !isRegistrationStatusPending(user.registration_status)) {
      throw notFound('api.pending_registrations.not_found', {}, 'Ausstehende Anmeldung nicht gefunden')
    }

    await this.db('users').where('id', user.id).del()
    await broadcastPendingRegistrationSummary(this.app)
    return serializePendingRegistration(user)
  }
}

export const pendingRegistrations = (app) => {
  app.use('pending-registrations', new PendingRegistrationsService(app), {
    methods: ['find', 'patch', 'remove'],
    events: []
  })

  app.service('pending-registrations').hooks({
    around: { all: [authenticate('jwt')] },
    before: {
      all: [checkPermission('manage_users')],
      patch: [validate(patchSchema)]
    }
  })
}
