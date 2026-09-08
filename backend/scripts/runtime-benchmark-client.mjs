import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import { io } from 'socket.io-client'
import knex from 'knex'

const baseUrl = 'http://backend:3030'
const manifest = JSON.parse(await readFile('/results/runtime-manifest.json', 'utf8'))
const quick = process.argv.includes('--quick')
const warmupMs = quick ? 2000 : 60000
const measurementMs = quick ? 15000 : 300000
const db = knex({ client: 'pg', connection: { host: 'postgres', database: 'nebulynk_ap05', user: 'ap05', password: process.env.POSTGRES_PASSWORD }, pool: { min: 0, max: 1 } })
const report = { startedAt: new Date().toISOString(), quick, warmupMs, measurementMs, stages: [], pool: { min: 2, max: 10 },
  disabled: ['AI', 'mail', 'push', 'LiveKit/media', 'platform update scheduler (NODE_ENV=test)'] }
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] : null
async function request(path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) })
  const result = await response.json()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.message}`)
  return result
}
async function connect(user) {
  user.socket = io(baseUrl, { transports: ['websocket'], reconnection: false, autoConnect: false })
  user.socket.on('messages created', (message) => user.onMessage?.(message))
  const connected = new Promise((resolve, reject) => {
    user.socket.once('connect', resolve)
    user.socket.once('connect_error', reject)
  })
  user.socket.connect()
  await connected
  await new Promise((resolve, reject) => {
    user.socket.timeout(10000).emit('create', 'authentication', { strategy: 'jwt', accessToken: user.token }, (timeout, error, result) => {
      if (timeout || error) reject(timeout || new Error(error.message))
      else resolve(result)
    })
  })
}

try {
  for (const size of quick ? [100] : [100, 500, 1000]) {
    console.log(`Starting stage ${size}`)
    const clients = manifest.users.slice(0, size).map((user) => ({ ...user }))
    const samples = { login: [], session: [], timeline: [], send: [], reconnect: [], event: [] }
    const errors = []
    const expected = new Map()
    const sentIds = []
    const inflight = new Set()
    let operations = 0
    let collecting = false
    let seq = 0
    async function measure(kind, work) {
      const collect = collecting || kind === 'login' || kind === 'session'
      const start = performance.now()
      if (collect) operations++
      try { const value = await work(); if (collect) samples[kind].push(performance.now() - start); return value }
      catch (error) { if (collect) errors.push({ kind, message: error.message }); return null }
    }
    function launch(work) {
      const promise = work()
      inflight.add(promise)
      promise.finally(() => inflight.delete(promise))
    }
    for (let start = 0; start < size; start += 10) {
      const began = performance.now()
      await Promise.all(clients.slice(start, start + 10).map(async (user) => {
        const auth = await measure('login', () => request('/authentication', { body: { strategy: 'local', email: user.email, password: manifest.password } }))
        if (!auth) return
        user.token = auth.accessToken
        const session = await measure('session', () => request('/auth/session/bootstrap', { token: user.token, body: { transport: 'body' } }))
        if (session) { user.token = session.accessToken || user.token; user.refreshToken = session.refreshToken }
        await measure('session', () => connect(user))
      }))
      await delay(Math.max(0, 1000 - (performance.now() - began)))
    }
    const started = performance.now()
    for (const [index, user] of clients.entries()) {
      user.nextRead = started + (index % 15) * 1000
      user.nextSend = started + (index % 10) * 1000
      user.onMessage = (message) => {
        const entry = expected.get(message.content)
        if (!entry || !entry.recipients.has(user.id)) return
        if (entry.received.has(user.id)) { errors.push({ kind: 'event-duplicate', message: message.id }); return }
        entry.received.add(user.id)
        const elapsed = performance.now() - entry.at
        samples.event.push(elapsed)
        if (elapsed > 10000) errors.push({ kind: 'event-late', message: message.id })
      }
    }
    let nextReconnect = started + 60000
    while (performance.now() - started < warmupMs + measurementMs) {
      const now = performance.now()
      collecting = now - started >= warmupMs
      for (const [index, user] of clients.entries()) {
        if (!user.token) continue
        if (now >= user.nextRead) {
          user.nextRead = now + 15000
          launch(() => measure('timeline', () => request(`/messages?${new URLSearchParams({ channel_id: user.channelId, $limit: '50' })}`, { token: user.token })))
        }
        if (index % 10 === 0 && now >= user.nextSend) {
          user.nextSend = now + 10000
          launch(() => measure('send', async () => {
            const content = `AP05 live ${size}/${seq++}`
            if (collecting) expected.set(content, { at: performance.now(), received: new Set(),
              recipients: new Set(clients.filter((client) => client.channelId === user.channelId && client.socket?.connected).map((client) => client.id)) })
            const message = await request('/messages', { token: user.token, body: { channel_id: user.channelId, content } })
            sentIds.push(message.id)
            return message
          }))
        }
      }
      if (now >= nextReconnect) {
        nextReconnect += 60000
        // Finish deliveries before planned disconnects, then reauthenticate 10%.
        await Promise.allSettled([...inflight])
        await delay(1000)
        await Promise.all(clients.filter((_, index) => index % 10 === 0).map((user) => measure('reconnect', async () => {
          user.socket?.disconnect()
          const session = await request('/auth/session/refresh', { body: { transport: 'body', refreshToken: user.refreshToken } })
          user.token = session.accessToken; user.refreshToken = session.refreshToken
          await connect(user)
        })))
      }
      await delay(100)
    }
    await Promise.allSettled([...inflight])
    await delay(10000)
    let missingEvents = 0
    for (const entry of expected.values()) missingEvents += entry.recipients.size - entry.received.size
    const rows = await db('messages').where('content', 'like', `AP05 live ${size}/%`).select('id', 'content')
    const persistedIds = new Set(rows.map((row) => row.id))
    const correctnessErrors = sentIds.filter((id) => !persistedIds.has(id)).length
      + rows.length - new Set(rows.map((row) => row.content)).size
      + Math.abs(rows.length - sentIds.length)
    for (const client of clients) client.socket?.disconnect()
    const latencyMs = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, { count: values.length, p50: percentile(values, .5), p95: percentile(values, .95) }]))
    const passed = errors.length / Math.max(1, operations) < .01 && !missingEvents && !correctnessErrors
      && latencyMs.login.p95 !== null && latencyMs.login.p95 <= 2000
      && ['timeline', 'send', 'event'].every((kind) => latencyMs[kind].p95 !== null && latencyMs[kind].p95 <= 1000)
    const stage = { size, passed, operations, operationsPerSecond: (samples.timeline.length + samples.send.length + samples.reconnect.length) / (measurementMs / 1000),
      errors, errorRate: errors.length / Math.max(1, operations), missingEvents, correctnessErrors, sentMessages: sentIds.length, latencyMs, samples }
    report.stages.push(stage)
    await writeFile('/results/runtime-results.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ ...stage, samples: undefined }))
    if (!passed) break
    await delay(6000)
  }
} finally {
  await db.destroy()
  await writeFile('/results/runtime-results.json', JSON.stringify(report, null, 2))
}
