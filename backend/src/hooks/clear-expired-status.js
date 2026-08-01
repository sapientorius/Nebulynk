export const clearExpiredStatus = async (context) => {
  const now = new Date()

  const processUser = async (user) => {
    if (user.status_expires_at && new Date(user.status_expires_at) < now) {
      const db = context.app.get('postgresqlClient')
      await db('users').where('id', user.id).update({
        custom_status: null,
        custom_status_emoji: null,
        status_expires_at: null,
        updated_at: now.toISOString()
      })
      user.custom_status = null
      user.custom_status_emoji = null
      user.status_expires_at = null
    }
  }

  if (context.result) {
    if (context.result.data && Array.isArray(context.result.data)) {
      for (const user of context.result.data) {
        await processUser(user)
      }
    } else if (Array.isArray(context.result)) {
      for (const user of context.result) {
        await processUser(user)
      }
    } else if (context.result.id) {
      await processUser(context.result)
    }
  }

  return context
}
