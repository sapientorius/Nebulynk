import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { Client } from 'pg'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })

const host = process.env.POSTGRES_HOST || '127.0.0.1'
const port = Number(process.env.POSTGRES_PORT) || 5433
const user = process.env.POSTGRES_USER || 'nebulynk'
const password = process.env.POSTGRES_PASSWORD || 'nebulynk_dev_password'
const targetDatabase = process.env.E2E_POSTGRES_DB || 'nebulynk_e2e'
const adminDatabase = process.env.POSTGRES_ADMIN_DB || 'postgres'

function assertIdentifier(identifier, label) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid ${label}: "${identifier}"`)
  }
}

assertIdentifier(targetDatabase, 'E2E_POSTGRES_DB')
assertIdentifier(adminDatabase, 'POSTGRES_ADMIN_DB')

if (targetDatabase === adminDatabase) {
  throw new Error('POSTGRES_DB must differ from POSTGRES_ADMIN_DB for e2e reset')
}

const client = new Client({
  host,
  port,
  user,
  password,
  database: adminDatabase
})

const quotedTargetDatabase = `"${targetDatabase}"`

await client.connect()

try {
  await client.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [targetDatabase]
  )
  await client.query(`DROP DATABASE IF EXISTS ${quotedTargetDatabase}`)
  await client.query(`CREATE DATABASE ${quotedTargetDatabase}`)
  console.log(`[e2e-reset-db] Reset database "${targetDatabase}" on ${host}:${port}`)
} finally {
  await client.end()
}
