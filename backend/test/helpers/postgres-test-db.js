import knex from 'knex'
import { createId } from '@paralleldrive/cuid2'
import { fileURLToPath } from 'node:url'
import { readdir } from 'node:fs/promises'

// Never load the application .env or knexfile: this URL must identify a test instance.
export async function createPostgresTestDb({ migrationTarget } = {}) {
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
    const migrationConfig = { directory: fileURLToPath(new URL('../../migrations/', import.meta.url)) }
    if (migrationTarget) {
      const names = (await readdir(migrationConfig.directory)).filter((name) => name.endsWith('.js')).sort()
      if (!names.includes(migrationTarget)) throw new Error('Unknown test migration target')
      await db.migrate.latest({ migrationSource: {
        getMigrations: async () => names.filter((name) => name <= migrationTarget),
        getMigrationName: (name) => name,
        getMigration: (name) => import(new URL(`../../migrations/${name}`, import.meta.url).href)
      } })
    } else {
      await db.migrate.latest(migrationConfig)
    }
    return { db, close }
  } catch (error) {
    await close()
    throw error
  }
}
