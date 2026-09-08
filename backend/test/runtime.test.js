import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import socketio from '@feathersjs/socketio'
import { io } from 'socket.io-client'
import { createRuntime } from '../src/lib/runtime.js'
import { teardownRuntime } from '../src/lib/runtime-teardown.js'
import { createServerLifecycle } from '../src/lib/server-lifecycle.js'
import { setupPresence } from '../src/presence.js'
import { StorageUsageManager } from '../src/lib/storage-usage.js'
import { PlatformUpdateManager } from '../src/lib/platform-updates.js'

const log = { info() {}, error() {} }
const deferred = () => Promise.withResolvers()

test('presence drains running offline writes and releases disconnect listeners', async () => {
  const app = new EventEmitter()
  const entered = deferred()
  const gate = deferred()
  let removed = false
  app.service = () => ({ async patch(_id, data) { if (data.status === 'offline') { entered.resolve(); await gate.promise } } })
  app.channel = () => ({ send() {} })
  const timers = new Set()
  const presence = setupPresence(app, {
    setTimer(fn) { timers.add(fn); return fn }, clearTimer(fn) { timers.delete(fn) },
    async removeParticipant() { removed = true }
  })
  const connection = {}
  await app.listeners('login')[0]({ user: { id: 'presence-user' } }, { connection })
  app.emit('disconnect', connection)
  const timer = [...timers][0]
  timers.delete(timer)
  timer()
  await entered.promise
  let stopped = false
  const stop = presence.stop().then(() => { stopped = true })
  app.emit('disconnect', connection)
  await delay(0)
  assert.equal(stopped, false)
  assert.equal(app.listenerCount('login'), 0)
  assert.equal(app.listenerCount('disconnect'), 0)
  gate.resolve()
  await stop
  assert.equal(removed, true)
  assert.equal(timers.size, 0)
})

test('storage manager waits for an active scan before destroying owned clients once', async () => {
  const manager = new StorageUsageManager({ get() {} })
  const gate = deferred()
  const order = []
  manager.scanPromise = gate.promise.then(() => order.push('scan'))
  const client = { destroy() { order.push('destroy') } }
  manager.recordingStorageClients.set('one', client)
  manager.recordingStorageClients.set('two', client)
  const stop = manager.stop()
  await delay(0)
  assert.deepEqual(order, [])
  gate.resolve()
  await stop
  assert.deepEqual(order, ['scan', 'destroy'])
  await manager.stop()
  assert.equal(order.length, 2)
})

test('update manager stops scheduling and awaits an active check', async () => {
  const manager = new PlatformUpdateManager({ get() {} }, { log })
  const gate = deferred()
  manager._check = () => gate.promise
  const check = manager.check()
  manager.quiesce()
  let stopped = false
  const stop = manager.stop().then(() => { stopped = true })
  await delay(0)
  assert.equal(stopped, false)
  await assert.rejects(manager.check(), /stopped/)
  gate.resolve()
  await Promise.all([check, stop])
  assert.equal(manager.timer, null)
})

test('scheduler does not overlap initial work, repeats after errors, and leaves no timers', async () => {
  const timers = new Map()
  const runtime = createRuntime({ log, setTimer(fn, ms) { const key = {}; timers.set(key, { fn, ms }); return key }, clearTimer(key) { timers.delete(key) } })
  const gate = deferred()
  let calls = 0
  runtime.register({ name: 'slow', intervalMs: 15, immediate: true, async run() { calls++; await gate.promise; throw new Error('retry') } })
  runtime.start()
  runtime.start()
  assert.equal(timers.size, 1)
  const [key, timer] = [...timers][0]
  timers.delete(key)
  timer.fn()
  await delay(0)
  assert.equal(calls, 1)
  assert.equal(timers.size, 0)
  gate.resolve()
  await delay(0)
  assert.equal([...timers.values()][0].ms, 15)
  const stop = runtime.stop()
  assert.equal(runtime.stop(), stop)
  await stop
  assert.equal(timers.size, 0)
  assert.throws(() => runtime.start(), /cannot be restarted/)
  await assert.rejects(runtime.track('late', () => {}), /stopping/)
})

test('drain permits descendants of admitted requests and closes DB last despite cleanup failure', async () => {
  const runtime = createRuntime({ log })
  runtime.ready()
  const requestGate = deferred()
  const childGate = deferred()
  const order = []
  const request = runtime.track('request', async () => {
    await requestGate.promise
    void runtime.track('recording', async () => { await childGate.promise; order.push('recording') })
  }, { external: true })
  const resources = {
    runtime,
    notificationSideEffectsDispatcher: { async stop() { order.push('dispatcher') } },
    storageUsageManager: { async stop() { order.push('storage') } },
    ownedStorageClients: new Set([{ destroy() { order.push('s3'); throw new Error('s3 failure') } }]),
    rateLimiter: { async close() { order.push('redis') } },
    postgresqlClient: { async destroy() { order.push('db') } }
  }
  const stop = teardownRuntime({ get: (key) => resources[key] }, async () => { order.push('services') })
  const rejection = assert.rejects(stop, /cleanup failed/)
  await assert.rejects(runtime.track('new-request', () => {}, { external: true }), /stopping/)
  requestGate.resolve()
  await request
  await delay(0)
  assert.deepEqual(order, [])
  childGate.resolve()
  await rejection
  assert.deepEqual(order, ['recording', 'dispatcher', 'services', 'storage', 's3', 'redis', 'db'])
})

test('real HTTP and sockets close once, including a disconnected client with ongoing work', async () => {
  const app = koa(feathers())
  const runtime = createRuntime({ log })
  app.set('runtime', runtime)
  app.configure(socketio())
  app.use(runtime.middleware)
  const entered = deferred()
  const gate = deferred()
  app.use(async (ctx) => { entered.resolve(); await gate.promise; ctx.body = 'done' })
  let teardownCount = 0
  app.hooks({ teardown: [async (_ctx, next) => { teardownCount++; await runtime.stop(); await next() }] })
  const exits = []
  const signals = new EventEmitter()
  const lifecycle = createServerLifecycle(app, { log, signals, exit: (code) => exits.push(code) })
  await lifecycle.start(0)
  const url = `http://127.0.0.1:${lifecycle.server.address().port}`
  assert.equal((await fetch(`${url}/health/ready`)).status, 200)
  const socket = io(url, { transports: ['websocket'], reconnection: false })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
  const request = http.get(url)
  request.on('error', () => {})
  await entered.promise
  request.destroy()
  signals.emit('SIGTERM')
  signals.emit('SIGINT')
  await delay(20)
  assert.deepEqual(exits, [])
  gate.resolve()
  await lifecycle.shutdown()
  socket.disconnect()
  assert.deepEqual(exits, [0])
  assert.equal(teardownCount, 1)
  assert.equal(lifecycle.server.listening, false)
  assert.equal(signals.listenerCount('SIGTERM'), 0)
})

test('setup failure cleans resources without starting jobs', async () => {
  const runtime = createRuntime({ log })
  let closed = false
  const app = {
    callback: () => () => {}, get: (key) => key === 'runtime' ? runtime : undefined,
    async setup() { throw new Error('migration failed') },
    async teardown() { await runtime.stop(); closed = true }
  }
  const exits = []
  await createServerLifecycle(app, { signals: new EventEmitter(), log, exit: (code) => exits.push(code) }).start(0)
  assert.equal(closed, true)
  assert.deepEqual(exits, [1])
})

test('signal during setup prevents listen and drains after setup completion', async () => {
  const runtime = createRuntime({ log })
  const gate = deferred()
  const app = { callback: () => () => {}, get: (key) => key === 'runtime' ? runtime : undefined,
    setup: () => gate.promise, teardown: () => runtime.stop() }
  const signals = new EventEmitter()
  const exits = []
  const lifecycle = createServerLifecycle(app, { signals, log, exit: (code) => exits.push(code) })
  const start = lifecycle.start(0)
  signals.emit('SIGTERM')
  gate.resolve()
  await start
  await lifecycle.shutdown()
  assert.equal(lifecycle.server.listening, false)
  assert.deepEqual(exits, [0])
})

test('setup failure after a signal keeps the failure exit code and tears down once', async () => {
  const runtime = createRuntime({ log })
  const gate = deferred()
  let teardowns = 0
  const app = { callback: () => () => {}, get: (key) => key === 'runtime' ? runtime : undefined,
    setup: () => gate.promise, async teardown() { teardowns++; await runtime.stop() } }
  const signals = new EventEmitter()
  const exits = []
  const lifecycle = createServerLifecycle(app, { signals, log, exit: (code) => exits.push(code) })
  const start = lifecycle.start(0)
  signals.emit('SIGTERM')
  gate.reject(new Error('migration failed during shutdown'))
  await start
  await lifecycle.shutdown()
  assert.deepEqual(exits, [1])
  assert.equal(teardowns, 1)
})
