import http from 'http'
import { app } from './app.js'
import { logger } from './logger.js'

const port = process.env.BACKEND_PORT || 3030

// Create HTTP server manually so Socket.IO attaches BEFORE listening starts
const server = http.createServer(app.callback())
await app.setup(server)

// Diagnostic: verify Socket.IO is initialized
logger.info(`Socket.IO initialized: ${!!app.io}`)
logger.info(`HTTP request listeners: ${server.listenerCount('request')}`)

server.listen(port, () => {
  logger.info(`Nebulynk API started on http://localhost:${port}`)
})
