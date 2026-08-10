import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { setUserId } from '../../hooks/set-user-id.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { badRequest } from '../../lib/errors.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './channels.schema.js'
import { ChannelsRepository } from '../../domains/channels/repository.js'
import { ChannelsDomainService } from '../../domains/channels/service.js'
import { DEFAULT_MEETING_HISTORY_ACCESS, normalizeMeetingHistoryAccess } from '../../lib/meeting-history-access.js'

function joinConnectionsToChannel(app, channelId, userIds) {
  try {
    const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))]
    if (uniqueUserIds.length === 0) return

    const connections = app.channel('authenticated').connections
    for (const connection of connections) {
      if (uniqueUserIds.includes(connection.user?.id)) {
        app.channel(`channel/${channelId}`).join(connection)
      }
    }
  } catch {
    // Non-critical: users rejoin channel rooms on next login.
  }
}

export class ChannelsService extends KnexService {
  constructor(options) {
    super(options)
    this.domainService = options.domainService
  }

  createQuery(params) {
    const includeArchived = params._includeArchived
      || params.query?.include_archived === true
      || params.query?.include_archived === 'true'
    const discoverPublic = params._discoverPublic
      || params.query?.discover_public === true
      || params.query?.discover_public === 'true'
    const includeMeeting = params._includeMeeting
      || params.query?.include_meeting === true
      || params.query?.include_meeting === 'true'
    const nextParams = {
      ...params,
      query: { ...(params.query || {}) }
    }
    delete nextParams.query.include_archived
    delete nextParams.query.discover_public
    delete nextParams.query.include_meeting
    const query = super.createQuery(nextParams)

    // Always exclude DM/group channels from regular channel listings
    // DMs are accessed exclusively via the /dms endpoint
    query.whereNotIn('channels.type', ['dm', 'group'])
    if (!includeMeeting) {
      query.where('channels.purpose', 'default')
    }
    if (!includeArchived) {
      query.where('channels.is_archived', false)
    }

    // Internal calls or admin: no visibility filter
    if (!params.provider || params.user?.is_admin) return query

    if (discoverPublic) {
      query.andWhere('channels.type', 'public')
      return query
    }

    // Non-admin users: only channels they are a member of.
    const accessibleChannelIds = params._accessibleChannelIds || []
    if (accessibleChannelIds.length === 0) {
      query.whereRaw('1 = 0')
      return query
    }
    query.whereIn('channels.id', accessibleChannelIds)

    return query
  }

  async join(channelId, params) {
    return this.domainService.joinChannel(channelId, params.user.id)
  }

  async leave(channelId, params) {
    return this.domainService.leaveChannel(channelId, params.user.id)
  }
}

export const channels = (app) => {
  const db = app.get('postgresqlClient')
  const domainService = new ChannelsDomainService({
    repository: new ChannelsRepository(db)
  })

  const options = {
    Model: db,
    name: 'channels',
    paginate: app.get('paginate'),
    domainService
  }

  app.use('channels', new ChannelsService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove', 'join', 'leave'],
    events: ['joined', 'left']
  })

  const service = app.service('channels')

  service.hooks({
    around: {
      all: [authenticate('jwt')],
      join: [authenticate('jwt')],
      leave: [authenticate('jwt')]
    },
    before: {
      find: [
        async (context) => {
          context.params.query = context.params.query || {}
          const access = await domainService.resolveFindAccess({
            provider: context.params.provider,
            user: context.params.user,
            query: context.params.query
          })

          context.params.query.include_archived = access.includeArchived
          context.params.query.discover_public = access.discoverPublic
          context.params._discoverPublic = access.discoverPublic
          context.params._accessibleChannelIds = access.accessibleChannelIds
          return context
        }
      ],
      get: [
        async (context) => {
          const access = await domainService.resolveFindAccess({
            provider: context.params.provider,
            user: context.params.user,
            query: context.params.query || {}
          })

          context.params._accessibleChannelIds = access.accessibleChannelIds
          context.params._includeArchived = true
          context.params._includeMeeting = true
          return context
        }
      ],
      create: [
        validate(createSchema),
        checkPermission('create_channels'),
        setUserId('created_by'),
        async (context) => {
          const db = context.app.get('postgresqlClient')
          const setting = await db('platform_settings')
            .where('key', 'default_meeting_history_access')
            .first()
          context.data.meeting_history_access = normalizeMeetingHistoryAccess(
            setting?.value,
            DEFAULT_MEETING_HISTORY_ACCESS
          )
          return context
        },
        async (context) => {
          const initialUserIds = Array.isArray(context.data?.initial_user_ids)
            ? [...new Set(context.data.initial_user_ids.filter((entry) => typeof entry === 'string' && entry.trim()))]
            : []

          if (initialUserIds.length > 0) {
            const db = context.app.get('postgresqlClient')
            const existingUsers = await db('users').whereIn('id', initialUserIds).select('id')
            if (existingUsers.length !== initialUserIds.length) {
              throw badRequest(
                'api.channels.one_or_more_user_ids_invalid',
                {},
                'One or more user IDs are invalid'
              )
            }
          }

          context.params._initialUserIds = initialUserIds
          context.data.id = createId()
          if (context.params.provider && !context.params.user?.is_admin) {
            const accessibleChannelIds = Array.isArray(context.params._accessibleChannelIds)
              ? context.params._accessibleChannelIds
              : []
            context.params._accessibleChannelIds = [...new Set([...accessibleChannelIds, context.data.id])]
          }
          delete context.data.initial_user_ids
          return context
        }
      ],
      patch: [
        async (context) => {
          context.params._includeArchived = true
          return context
        },
        validate(patchSchema),
        checkPermission('manage_channels'),
        async (context) => {
          context.data = domainService.addArchiveMetadata(context.data, context.params.user.id)
          return context
        }
      ],
      remove: [
        async (context) => {
          context.params._includeArchived = true
          return context
        },
        checkPermission('manage_channels')
      ]
    },
    after: {
      create: [
        // Auto-join creator as owner and optionally add selected members.
        async (context) => {
          const db = context.app.get('postgresqlClient')
          const channelId = context.result.id
          const creatorId = context.params.user.id
          const initialUserIds = (context.params._initialUserIds || []).filter((userId) => userId !== creatorId)

          const membershipRows = [
            {
              id: createId(),
              channel_id: channelId,
              user_id: creatorId,
              role: 'owner'
            },
            ...initialUserIds.map((userId) => ({
              id: createId(),
              channel_id: channelId,
              user_id: userId,
              role: 'member'
            }))
          ]

          await db('channel_members')
            .insert(membershipRows)
            .onConflict(['channel_id', 'user_id'])
            .ignore()

          joinConnectionsToChannel(context.app, channelId, [creatorId, ...initialUserIds])
          return context
        }
      ]
    },
    error: {}
  })
}
