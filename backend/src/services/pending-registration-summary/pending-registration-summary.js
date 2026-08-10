import { authenticate } from '@feathersjs/authentication'
import { checkPermission } from '../../hooks/check-permission.js'
import { getPendingRegistrationAlertCount } from '../../lib/registration-pending-alerts.js'

export class PendingRegistrationSummaryService {
  constructor(app) {
    this.db = app.get('postgresqlClient')
  }

  async find() {
    return {
      count: await getPendingRegistrationAlertCount(this.db)
    }
  }
}

export const pendingRegistrationSummary = (app) => {
  app.use('pending-registration-summary', new PendingRegistrationSummaryService(app), {
    methods: ['find'],
    events: []
  })

  app.service('pending-registration-summary').hooks({
    around: { all: [authenticate('jwt')] },
    before: { all: [checkPermission('manage_users')] }
  })
}
