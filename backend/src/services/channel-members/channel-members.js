import { KnexService } from '@feathersjs/knex'
import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { isChannelMember } from '../../hooks/is-channel-member.js'
import { checkPermission } from '../../hooks/check-permission.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './channel-members.schema.js'
import { ChannelMembersRepository } from '../../domains/channel-members/repository.js'
import { ChannelMembersDomainService } from '../../domains/channel-members/service.js'

export class ChannelMembersService extends KnexService {}

function joinUserConnectionsToChannel(app, channelId, userId) {
  try {
    const connections = app.channel('authenticated').connections
    for (const connection of connections) {
      if (connection.user?.id === userId) {
        app.channel(`channel/${channelId}`).join(connection)
      }
    }
  } catch {
    // Non-critical: connections will rejoin at next login.
  }
}

function leaveUserConnectionsFromChannel(app, channelId, userId) {
  try {
    const connections = app.channel('authenticated').connections
    for (const connection of connections) {
      if (connection.user?.id === userId) {
        app.channel(`channel/${channelId}`).leave(connection)
      }
    }
  } catch {
    // Non-critical: room membership will be refreshed on reconnect.
  }
}

export const channelMembers = (app) => {
  const options = {
    Model: app.get('postgresqlClient'),
    name: 'channel_members',
    paginate: app.get('paginate')
  }

  app.use('channel-members', new ChannelMembersService(options), {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  const domainService = new ChannelMembersDomainService({
    repository: new ChannelMembersRepository(app.get('postgresqlClient'))
  })

  const service = app.service('channel-members')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [
        validate(createSchema),
        async (context) => {
          const access = await domainService.resolveCreateAccess({
            currentUserId: context.params.user?.id,
            createData: context.data || {},
            currentQuery: context.params.query
          })

          context.params.query = access.query

          if (access.requiresManagePermission) {
            await checkPermission('manage_channel_members')(context)
          }

          if (access.shortCircuitMembership) {
            context.result = access.shortCircuitMembership
            return context
          }

          context.data = {
            ...access.normalizedCreateData,
            id: createId()
          }
          return context
        }
      ],
      find: [
        async (context) => {
          domainService.assertFindAccess({
            user: context.params.user,
            query: context.params.query
          })
          return context
        },
        isChannelMember()
      ],
      patch: [
        validate(patchSchema),
        async (context) => {
          const access = await domainService.resolvePatchAccess({
            membershipId: context.id,
            currentUserId: context.params.user?.id,
            patchData: context.data || {},
            currentQuery: context.params.query
          })

          context.params.query = access.query

          if (access.requiresManagePermission) {
            await checkPermission('manage_channel_members')(context)
          }

          return context
        }
      ],
      remove: [
        async (context) => {
          const access = await domainService.resolveRemoveAccess({
            membershipId: context.id,
            currentUserId: context.params.user?.id,
            currentQuery: context.params.query
          })

          context.params.query = access.query
          context.params._targetMembership = access.targetMembership

          if (access.requiresManagePermission) {
            await checkPermission('manage_channel_members')(context)
          }

          return context
        }
      ]
    },
    after: {
      create: [
        async (context) => {
          if (context.result?.channel_id && context.result?.user_id) {
            joinUserConnectionsToChannel(context.app, context.result.channel_id, context.result.user_id)
          }
          return context
        }
      ],
      remove: [
        async (context) => {
          const targetMembership = context.params._targetMembership
          if (targetMembership?.channel_id && targetMembership?.user_id) {
            leaveUserConnectionsFromChannel(context.app, targetMembership.channel_id, targetMembership.user_id)
          }
          return context
        }
      ]
    },
    error: {}
  })
}
