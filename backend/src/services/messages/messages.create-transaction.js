import { sanitizeFilesForExternal } from '../../lib/file-response.js'
import { logger } from '../../logger.js'

// This service owns its commit boundary, including the automatic Feathers event.
export async function messageCreateTransaction(context, next) {
  const originalParams = context.params
  if (originalParams.transaction) {
    throw new Error('messages.create does not support an outer transaction')
  }
  const notifications = []
  try {
    await context.app.get('postgresqlClient').transaction(async (trx) => {
      context.params = { ...originalParams, transaction: { trx }, _messageNotifications: notifications }
      await next()
      // Socket events also need a safe dispatch payload for internal creates.
      context.dispatch = {
        ...context.result,
        ...(context.result.files ? { files: sanitizeFilesForExternal(context.result.files) } : {})
      }
    })
  } catch (error) {
    context.event = null
    delete context.result
    delete context.dispatch
    throw error
  } finally {
    context.params = originalParams
  }

  // The callback transaction has committed. Delivery failures cannot undo the write.
  if (notifications.length > 0) {
    try {
      context.app.get('notificationSideEffectsDispatcher')?.enqueue(notifications)
    } catch (error) {
      logger.error('Failed to enqueue committed message notifications', {
        messageId: context.result.id, error: error.message
      })
    }
  }
}
