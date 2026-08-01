import { validate } from '../../schemas/validators.js'
import { createSchema } from './invite-accept.schema.js'
import { InviteAcceptRepository } from '../../domains/invite-accept/repository.js'
import { InviteAcceptDomainService } from '../../domains/invite-accept/service.js'
import {
  createInviteAcceptCreateRateLimitHook,
  createInviteAcceptFindRateLimitHook
} from '../../hooks/rate-limit.js'

class InviteAcceptService {
  constructor(app) {
    this.app = app
    this.domainService = new InviteAcceptDomainService({
      repository: new InviteAcceptRepository(app.get('postgresqlClient')),
      usersService: app.service('users')
    })
  }

  // GET /invite-accept?token=xxx returns invite info (public)
  async find(params) {
    return this.domainService.findInviteByToken(params.query?.token)
  }

  // POST /invite-accept accepts invite and creates user (public)
  async create(data) {
    const { token, display_name: displayName, password } = data
    return this.domainService.acceptInvite({ token, displayName, password })
  }
}

export const inviteAccept = (app) => {
  app.use('invite-accept', new InviteAcceptService(app), {
    methods: ['find', 'create'],
    events: []
  })

  // No authentication; this is a public service
  app.service('invite-accept').hooks({
    around: {},
    before: {
      find: [createInviteAcceptFindRateLimitHook()],
      create: [validate(createSchema), createInviteAcceptCreateRateLimitHook()]
    },
    after: {},
    error: {}
  })
}
