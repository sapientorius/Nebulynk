import http from 'node:http'

export const SHUTDOWN_TIMEOUT_MS = 60_000

export function createServerLifecycle(app, {
  server = http.createServer(app.callback()), log = console, signals = process,
  exit = (code) => process.exit(code), timeoutMs = SHUTDOWN_TIMEOUT_MS
} = {}) {
  const runtime = app.get('runtime')
  let setupPromise
  let shutdownPromise
  let stopping = false
  let failed = false
  const handlers = new Map()

  function shutdown(reason = 'shutdown', failure = false) {
    failed ||= failure
    if (shutdownPromise) return shutdownPromise
    stopping = true
    runtime.quiesce()
    app.get('presenceController')?.quiesce()
    app.get('platformUpdateManager')?.quiesce()
    log.info('Server shutdown started', { reason, timeoutMs })
    const deadline = setTimeout(() => {
      log.error('Server shutdown deadline exceeded', { pending: runtime.getPendingNames() })
      exit(1)
    }, timeoutMs)
    shutdownPromise = (async () => {
      try {
        await setupPromise?.catch(() => { failed = true })
        // Socket.IO owns HTTP close; do not assign app.server (Koa double-close).
        try {
          if (app.io) await app.io.close()
          else if (server.listening) await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve())
          })
        } finally {
          await app.teardown()
        }
      } catch (error) {
        failed = true
        log.error('Server shutdown failed', { error: error.message })
      } finally {
        clearTimeout(deadline)
        for (const [signal, handler] of handlers) signals.removeListener(signal, handler)
      }
      log.info('Server shutdown completed', { failed })
      exit(failed ? 1 : 0)
    })()
    return shutdownPromise
  }

  return {
    server, shutdown,
    async start(port) {
      for (const signal of ['SIGTERM', 'SIGINT']) {
        const handler = () => { void shutdown(signal) }
        handlers.set(signal, handler)
        signals.on(signal, handler)
      }
      try {
        setupPromise = Promise.resolve().then(() => app.setup(server))
        await setupPromise
        if (stopping) return
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, () => {
            server.removeListener('error', reject)
            resolve()
          })
        })
        if (stopping) return
        runtime.ready()
        runtime.start()
        app.get('platformUpdateManager')?.start()
        log.info('Nebulynk API ready', { port: server.address().port })
      } catch (error) {
        log.error('Server setup failed', { error: error.message })
        await shutdown('setup-failed', true)
      }
    }
  }
}
