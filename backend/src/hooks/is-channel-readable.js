import { assertCanReadChannel } from '../domains/meetings/content-access.js'

export const isChannelReadable = () => async (context) => {
  const user = context.params.user
  if (!user) return context

  const channelId = context.data?.channel_id
    || context.params.query?.channel_id
    || context.id

  if (!channelId) return context

  const access = await assertCanReadChannel(
    context.app.get('postgresqlClient'),
    { channelId, user }
  )
  context.params.membership = access.membership || null
  context.params.meetingContentAccess = access.meetingAccess || null
  return context
}
