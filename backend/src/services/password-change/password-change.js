import { authenticate } from '@feathersjs/authentication'
import { validate } from '../../schemas/validators.js'
import { badRequest, forbidden } from '../../lib/errors.js'
import { createSchema } from './password-change.schema.js'

function isInvalidCurrentPasswordError(error) {
  return error?.name === 'NotAuthenticated'
    || error?.className === 'not-authenticated'
}

export class PasswordChangeService {
  constructor(app) {
    this.app = app
  }

  async create(data, params = {}) {
    const user = params.user || null

    if (!user?.id || !user?.email) {
      throw forbidden('api.password_change.authentication_required', {}, 'Authentication required')
    }

    if (user.account_type === 'guest') {
      throw forbidden(
        'api.password_change.guest_accounts_forbidden',
        {},
        'Guest accounts cannot change passwords'
      )
    }

    try {
      await this.app.service('authentication').create({
        strategy: 'local',
        email: user.email,
        password: data.current_password
      }, {})
    } catch (error) {
      if (isInvalidCurrentPasswordError(error)) {
        throw badRequest(
          'api.password_change.invalid_current_password',
          {},
          'Current password is incorrect'
        )
      }
      throw error
    }

    await this.app.service('users').patch(user.id, {
      password: data.new_password
    }, {})

    return { ok: true }
  }
}

export const passwordChange = (app) => {
  app.use('password-change', new PasswordChangeService(app), {
    methods: ['create'],
    events: []
  })

  app.service('password-change').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)]
    },
    after: {},
    error: {}
  })
}
