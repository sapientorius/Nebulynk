import knex from 'knex'
import { feathers } from '@feathersjs/feathers'
import { koa } from '@feathersjs/koa'
import { createRuntime } from '../src/lib/runtime.js'
import { createServerLifecycle } from '../src/lib/server-lifecycle.js'
import { processDueMessageReminders } from '../src/services/message-reminders/processor.js'
import { processPendingMeetingSummaries } from '../src/services/meetings/summary-processor.js'

const url = new URL(process.env.AP05_WORKER_DB_URL)
if (!url.pathname.startsWith('/nebulynk_test_ap01_')) throw new Error('Worker requires an isolated test database')
const db = knex({ client: 'pg', connection: url.toString(), pool: { min: 0, max: 2 } })
const app = koa(feathers())
const runtime = createRuntime()
app.set('runtime', runtime)
app.set('postgresqlClient', db)
app.set('authentication', { secret: 'ap05-recovery-secret' })
app.set('generateStructuredObject', async (args) => {
  if (process.argv.includes('--blocked')) {
    process.send({ phase: 'blocked' })
    await new Promise(() => {})
  }
  return args.validateObject({ mini_summary: 'Recovered summary', summary_points: ['Recovered input'], decisions: [], open_items: [], topic_chapters: [] })
})
app.use('meetings', { async find() { return [] } })
app.hooks({ teardown: [async (_context, next) => { await runtime.stop(); await next(); await db.destroy() }] })
runtime.register({ name: 'recovery-job', immediate: true, intervalMs: 60000, async run() {
  if (process.argv.includes('--summary')) await processPendingMeetingSummaries(app)
  else await processDueMessageReminders(app)
  process.send({ phase: 'done' })
} })
await createServerLifecycle(app, { timeoutMs: 150 }).start(0)
process.send({ phase: 'ready' })
