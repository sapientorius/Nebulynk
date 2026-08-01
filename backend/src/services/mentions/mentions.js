import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { MentionsRepository } from '../../domains/mentions/repository.js'
import { MentionsDomainService } from '../../domains/mentions/service.js'

export class MentionsService extends KnexService {
  constructor(options) {
    super(options)
    this.domainService = options.domainService
  }

  async find(params) {
    const access = params._mentionsAccess || await this.domainService.resolveFindAccess(params)
    const data = await this.domainService.listMentions(access)
    return { data }
  }
}

export const mentions = (app) => {
  const db = app.get('postgresqlClient')
  const domainService = new MentionsDomainService({
    repository: new MentionsRepository(db)
  })

  const options = {
    Model: db,
    name: 'mentions',
    paginate: false,
    domainService
  }

  app.use('mentions', new MentionsService(options), {
    methods: ['find', 'get'],
    events: []
  })

  const service = app.service('mentions')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      find: [
        async (context) => {
          const access = await domainService.resolveFindAccess(context.params)
          context.params._mentionsAccess = access
          context.params.query = access.query
          return context
        }
      ]
    },
    after: {},
    error: {}
  })
}
