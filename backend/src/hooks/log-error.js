import { logger } from '../logger.js'
import { attachErrorMetadata } from '../lib/errors.js'

export const logErrorHook = async (context, next) => {
  try {
    await next()
  } catch (error) {
    const normalizedError = attachErrorMetadata(error)
    logger.error(normalizedError.message, {
      stack: normalizedError.stack,
      error_code: normalizedError.error_code
    })
    throw normalizedError
  }
}
