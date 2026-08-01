import { authenticate } from '@feathersjs/authentication'

export class UnreadCountsService {
  constructor(options) {
    this.options = options
  }

  async find(params) {
    const db = this.options.Model
    const userId = params.user.id

    const result = await db.raw(`
      SELECT cm.channel_id, COUNT(m.id)::int AS count
      FROM channel_members cm
      JOIN messages m
        ON m.channel_id = cm.channel_id
        AND m.deleted_at IS NULL
        AND m.created_at > COALESCE(cm.last_read_at, cm.created_at)
      WHERE cm.user_id = ?
      GROUP BY cm.channel_id
    `, [userId])

    return (result.rows || result).map((r) => ({
      channel_id: r.channel_id,
      count: parseInt(r.count, 10) || 0
    }))
  }
}

export const unreadCounts = (app) => {
  app.use('unread-counts', new UnreadCountsService({ Model: app.get('postgresqlClient') }), {
    methods: ['find'],
    events: []
  })

  app.service('unread-counts').hooks({
    around: {
      all: [authenticate('jwt')]
    }
  })
}
