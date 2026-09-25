import './transcription-worker-env.js'
import knex from 'knex'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createStorageClient } from './lib/storage.js'
import { getEgressStorageConfig } from './lib/livekit.js'
import { resolveAuthenticationSecret } from './lib/security-config.js'
import { clearStaleTranscriptionFiles, transcriptionTempRoot } from './lib/streamed-meeting-audio.js'
import { runTranscriptionWorkerTick } from './services/meetings/transcription-worker-runtime.js'
import { logger } from './logger.js'

const authenticationSecret = resolveAuthenticationSecret(process.env)
if (process.env.NODE_ENV === 'production' && [
  process.env.JWT_SECRET,
  process.env.AI_SECRET_KEY,
  process.env.POSTGRES_PASSWORD,
  process.env.STORAGE_S3_SECRET_KEY
].some((value) => !value)) {
  throw new Error('Transcription worker is missing production credentials')
}

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT) || 5433,
    database: process.env.POSTGRES_DB || 'nebulynk',
    user: process.env.POSTGRES_USER || 'nebulynk',
    password: process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
  },
  pool: { min: 0, max: 3 }
})
const recordingStorage = getEgressStorageConfig()
const storageClient = createStorageClient({
  endpoint: recordingStorage.endpoint,
  region: recordingStorage.region
})
const app = {
  get(name) {
    if (name === 'authentication') return { secret: authenticationSecret }
    if (name === 'postgresqlClient') return db
    if (name === 'storageClient') return storageClient
    return undefined
  }
}

let stopping = false
const healthPath = join(transcriptionTempRoot(), 'health')
await clearStaleTranscriptionFiles()
await db.raw('select 1')
await db('meeting_transcription_jobs').first('id')
logger.info('Meeting transcription worker started')

const healthTimer = setInterval(() => {
  writeFile(healthPath, new Date().toISOString()).catch((error) => {
    logger.warn('Transcription worker health write failed', { error: error.message })
  })
}, 15_000)
await writeFile(healthPath, new Date().toISOString())

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { stopping = true })
}

try {
  while (!stopping) {
    try {
      const processed = await runTranscriptionWorkerTick({ db, app, storageClient })
      if (processed) continue
    } catch (error) {
      logger.error('Meeting transcription worker tick failed', { error: error.message })
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000))
  }
} finally {
  clearInterval(healthTimer)
  storageClient.destroy?.()
  await db.destroy()
  logger.info('Meeting transcription worker stopped')
}
