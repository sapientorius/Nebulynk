import { app } from './app.js'
import { logger } from './logger.js'
import { createServerLifecycle } from './lib/server-lifecycle.js'

await createServerLifecycle(app, { log: logger }).start(Number(process.env.BACKEND_PORT) || 3030)
