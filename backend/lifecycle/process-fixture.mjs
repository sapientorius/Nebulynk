import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import { createRuntime } from '../src/lib/runtime.js'
import { createServerLifecycle } from '../src/lib/server-lifecycle.js'

const app = koa(feathers())
const runtime = createRuntime()
app.set('runtime', runtime)
app.configure(socketio())
app.use(runtime.middleware)
app.hooks({ teardown: [async (_context, next) => { await runtime.stop(); await next() }] })
if (process.argv.includes('--blocked')) runtime.register({ name: 'artificially-blocked-job', immediate: true, intervalMs: 10, run: () => new Promise(() => {}) })
const lifecycle = createServerLifecycle(app, { timeoutMs: 150 })
await lifecycle.start(0)
await new Promise((resolve) => setTimeout(resolve, 10))
process.send?.({ port: lifecycle.server.address().port })
