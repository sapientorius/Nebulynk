import knex from 'knex'
import { createId } from '@paralleldrive/cuid2'
import { fileURLToPath } from 'node:url'

// Never load the application .env or knexfile: this URL must identify a test instance.
export async function createPostgresTestDb() {
  const connection = process.env.NEBULYNK_TEST_POSTGRES_URL
  if (!connection) {
    throw new Error('NEBULYNK_TEST_POSTGRES_URL must explicitly identify an isolated PostgreSQL test instance')
  }
  const databaseName = `nebulynk_test_ap01_${createId()}`
  const admin = knex({ client: 'pg', connection, pool: { min: 0, max: 1 } })
  let created = false
  let db
  async function close() {
    try {
      await db?.destroy()
      if (created && /^nebulynk_test_ap01_[a-z0-9]+$/.test(databaseName)) {
        await admin.raw('DROP DATABASE ?? WITH (FORCE)', [databaseName])
        created = false
      }
    } finally {
      await admin.destroy()
    }
  }

  try {
    await admin.raw('CREATE DATABASE ??', [databaseName])
    created = true
    const testUrl = new URL(connection)
    testUrl.pathname = `/${databaseName}`
    db = knex({
      client: 'pg',
      connection: { connectionString: testUrl.toString(), statement_timeout: 10000, lock_timeout: 5000 },
      pool: { min: 0, max: 8 },
      acquireConnectionTimeout: 10000
    })
    await db.migrate.latest({ directory: fileURLToPath(new URL('../../migrations/', import.meta.url)) })
    return { db, close }
  } catch (error) {
    await close()
    throw error
  }
}
