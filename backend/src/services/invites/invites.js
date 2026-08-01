import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { checkPermission } from '../../hooks/check-permission.js'
import { getEmailDeliveryStatus, sendInviteEmail } from '../../email.js'
import { badRequest } from '../../lib/errors.js'
import { resolveFrontendUrl } from '../../lib/security-config.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './invites.schema.js'

export class InvitesService extends KnexService {
  async find(params) {
    const db = this.options.Model

    const query = db('invites')
      .leftJoin('users as inviter', 'invites.invited_by', 'inviter.id')
      .leftJoin('users as accepter', 'invites.accepted_by', 'accepter.id')
      .select(
        'invites.*',
        'inviter.display_name as invited_by_name',
        'accepter.display_name as accepted_by_name'
      )
      .orderBy('invites.created_at', 'desc')

    if (params.query?.status) {
      query.where('invites.status', params.query.status)
    }

    const limit = params.query?.$limit || 50
    query.limit(limit)

    return query
  }
}

export async function appendInviteEmailStatus(context) {
  const db = context.app.get('postgresqlClient')
  const platformName = await db('platform_settings').where('key', 'platform_name').first()
  const defaultLocale = await db('platform_settings').where('key', 'default_locale').first()

  const emailResult = await sendInviteEmail(context.app, {
    email: context.result.email,
    token: context.params._inviteToken,
    inviterName: context.params._inviterName,
    platformName: platformName?.value || 'Nebulynk',
    message: context.result.message,
    locale: defaultLocale?.value || 'en'
  })
  const deliveryStatus = await getEmailDeliveryStatus(context.app)

  context.result.email_sent = emailResult.ok
  context.result.email_configured = deliveryStatus.configured
  context.result.email_error_code = emailResult.errorCode
  context.result.email_error_message = emailResult.errorMessage
  context.result.email_delivery_source = emailResult.source || deliveryStatus.source
  context.result.invite_url = `${resolveFrontendUrl(process.env)}/invite/${context.params._inviteToken}`

  return context
}

export const invites = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'invites',
    paginate: app.get('paginate')
  }

  app.use('invites', new InvitesService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  const service = app.service('invites')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [checkPermission('create_invites')],
      create: [
        validate(createSchema),
        checkPermission('create_invites'),
        async (context) => {
          const { email, role_to_assign, message, expires_in } = context.data
          const emailTrimmed = email.trim().toLowerCase()
          const db = context.app.get('postgresqlClient')

          const existingUser = await db('users').where('email', emailTrimmed).first()
          if (existingUser) {
            throw badRequest(
              'api.invites.user_with_email_already_exists',
              { email: emailTrimmed },
              'Ein Nutzer mit dieser E-Mail existiert bereits'
            )
          }

          const pendingInvite = await db('invites').where({ email: emailTrimmed, status: 'pending' }).first()
          if (pendingInvite) {
            throw badRequest(
              'api.invites.pending_invite_for_email_already_exists',
              { email: emailTrimmed },
              'Es gibt bereits eine ausstehende Einladung fuer diese E-Mail'
            )
          }

          const token = createId()

          context.data = {
            id: createId(),
            email: emailTrimmed,
            token,
            invited_by: context.params.user.id,
            role_to_assign: role_to_assign || 'platform:member',
            message: message || null,
            status: 'pending',
            expires_at: expires_in ? new Date(Date.now() + expires_in).toISOString() : null
          }

          context.params._inviteToken = token
          context.params._inviterName = context.params.user.display_name

          return context
        }
      ],
      patch: [
        validate(patchSchema),
        checkPermission('create_invites'),
        async (context) => {
          if (context.data.status === 'revoked') {
            context.data = { status: 'revoked', updated_at: new Date().toISOString() }
          } else {
            throw badRequest(
              'api.invites.only_revoke_status_change_allowed',
              {},
              'Einladungen koennen nur widerrufen werden'
            )
          }
          return context
        }
      ],
      remove: [checkPermission('manage_users')]
    },
    after: {
      create: [
        appendInviteEmailStatus
      ]
    },
    error: {}
  })
}
