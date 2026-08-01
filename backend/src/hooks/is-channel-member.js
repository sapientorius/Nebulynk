import { forbidden } from '../lib/errors.js'

// Checks if the authenticated user is a member of the channel
export const isChannelMember = () => async (context) => {
  const user = context.params.user
  if (!user) return context

  // Admins bypass membership check
  if (user.is_admin) return context

  // Determine channel_id from data or query
  const channelId = context.data?.channel_id
    || context.params.query?.channel_id
    || context.id

  if (!channelId) return context

  const db = context.app.get('postgresqlClient')
  const membership = await db('channel_members')
    .where({ channel_id: channelId, user_id: user.id })
    .first()

  if (!membership) {
    throw forbidden(
      'api.channels.membership_required',
      { channel_id: channelId },
      'You are not a member of this channel'
    )
  }

  // Attach membership info for downstream hooks
  context.params.membership = membership

  return context
}
