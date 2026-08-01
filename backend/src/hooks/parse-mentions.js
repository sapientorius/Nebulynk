import { createId } from '@paralleldrive/cuid2'

export const parseMentions = async (context) => {
  const { content } = context.result
  if (!content) return context

  const db = context.app.get('postgresqlClient')
  const messageId = context.result.id
  const mentions = []

  // Match @all
  if (content.includes('@all')) {
    mentions.push({ id: createId(), message_id: messageId, user_id: null, type: 'all' })
  }

  // Match @channel
  if (content.includes('@channel')) {
    mentions.push({ id: createId(), message_id: messageId, user_id: null, type: 'channel' })
  }

  // Load all users for display_name matching
  const users = await db('users').select('id', 'display_name')

  // Sort by display_name length (longest first) to prefer longer matches
  users.sort((a, b) => (b.display_name?.length || 0) - (a.display_name?.length || 0))

  // Find @DisplayName mentions
  const mentionedUserIds = new Set()
  for (const user of users) {
    if (!user.display_name) continue
    const pattern = `@${user.display_name}`
    if (content.toLowerCase().includes(pattern.toLowerCase()) && !mentionedUserIds.has(user.id)) {
      mentionedUserIds.add(user.id)
      mentions.push({
        id: createId(),
        message_id: messageId,
        user_id: user.id,
        type: 'user'
      })
    }
  }

  if (mentions.length > 0) {
    await db('mentions').insert(mentions.map((m) => ({
      ...m,
      created_at: new Date().toISOString()
    })))
  }

  // Attach mentions to result for broadcasting
  context.result.mentions = mentions

  return context
}
