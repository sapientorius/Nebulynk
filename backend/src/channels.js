import { logger } from './logger.js'

export const channels = (app) => {
  if (typeof app.channel !== 'function') {
    return
  }

  app.on('connection', (connection) => {
    app.channel('anonymous').join(connection)
  })

  app.on('login', async (authResult, { connection }) => {
    if (!connection) return

    const user = authResult.user

    // Leave anonymous, join authenticated
    app.channel('anonymous').leave(connection)
    if (user?.account_type !== 'guest') {
      app.channel('authenticated').join(connection)
    }

    // Join user's personal channel (for DMs, notifications)
    app.channel(`user/${user.id}`).join(connection)

    // Join all channels the user is a member of
    try {
      const db = app.get('postgresqlClient')
      const memberships = await db('channel_members').where('user_id', user.id)
      for (const membership of memberships) {
        app.channel(`channel/${membership.channel_id}`).join(connection)
      }
    } catch (error) {
      logger.error('Error joining channels on login', { error: error.message })
    }

    logger.info(`User ${user.display_name} connected`, { userId: user.id })
  })

  // Messages -> publish to the specific channel room
  app.service('messages').publish('created', (data) => app.channel(`channel/${data.channel_id}`))
  app.service('messages').publish('patched', (data) => app.channel(`channel/${data.channel_id}`))
  app.service('messages').publish('removed', (data) => app.channel(`channel/${data.channel_id}`))

  // Channels -> DM/group/meeting/private stay scoped to channel participants.
  // Public channel metadata can be broadcast to authenticated users for discovery.
  app.service('channels').publish((data) => {
    if (data.type === 'dm' || data.type === 'group' || data.purpose === 'meeting' || data.type === 'private') {
      return app.channel(`channel/${data.id}`)
    }
    return app.channel('authenticated')
  })

  // Channel members -> publish to channel room and affected user.
  app.service('channel-members').publish((data) => ([
    app.channel(`channel/${data.channel_id}`),
    app.channel(`user/${data.user_id}`)
  ]))

  // Raw role tables are admin-only over HTTP and should not fan out payloads.
  app.service('roles').publish(() => null)
  app.service('role-permissions').publish(() => null)

  // User-roles -> publish to affected user's personal channel
  app.service('user-roles').publish((data) => app.channel(`user/${data.user_id}`))

  // Users -> broadcast profile/status changes to all authenticated
  app.service('users').publish('patched', (data) => {
    if (data?.account_type === 'guest') {
      return app.channel(`user/${data.id}`)
    }
    return app.channel('authenticated')
  })

  // Invites contain invite tokens/email metadata; admin panels refresh via HTTP.
  app.service('invites').publish(() => null)

  // Voice -> publish participant events only to the target room
  app.service('voice').publish('participant-joined', (data) => app.channel(`channel/${data.channelId}`))
  app.service('voice').publish('participant-left', (data) => app.channel(`channel/${data.channelId}`))
  app.service('voice').publish('participant-updated', (data) => app.channel(`channel/${data.channelId}`))

  // Meetings -> room updates to meeting channel, invites to target users
  app.service('meetings').publish('created', (data) => app.channel(`channel/${data.chat_channel_id}`))
  app.service('meetings').publish('invited', (data) => {
    const targetChannels = (data.userIds || []).map((userId) => app.channel(`user/${userId}`))
    if (targetChannels.length === 0) return null
    return targetChannels
  })
  app.service('meetings').publish('joined', (data) => app.channel(`channel/${data.chatChannelId}`))
  app.service('meetings').publish('ended', (data) => app.channel(`channel/${data.chatChannelId}`))
  app.service('meetings').publish('artifacts-queued', (data) => app.channel(`channel/${data.chatChannelId}`))
  app.service('meetings').publish('artifacts-updated', (data) => app.channel(`channel/${data.chatChannelId}`))
  app.service('meetings').publish('recording-state-updated', (data) => app.channel(`channel/${data.chatChannelId}`))

  // Voice message AI artifacts are private per user.
  app.service('voice-message-artifacts').publish((data) => app.channel(`user/${data.user_id}`))

  // Chat summary AI artifacts are private per user.
  app.service('message-summaries').publish((data) => app.channel(`user/${data.user_id}`))

  // Reactions -> publish to the channel room the message belongs to
  app.service('reactions').publish('created', (data) => app.channel(`channel/${data.channel_id}`))
  app.service('reactions').publish('removed', (data) => app.channel(`channel/${data.channel_id}`))

  // Pinned messages -> publish to the channel room
  app.service('pinned-messages').publish('created', (data) => app.channel(`channel/${data.channel_id}`))
  app.service('pinned-messages').publish('removed', (data) => app.channel(`channel/${data.channel_id}`))

  // Notifications -> publish to recipient's personal channel
  app.service('notifications').publish('created', (data) => app.channel(`user/${data.user_id}`))
}
