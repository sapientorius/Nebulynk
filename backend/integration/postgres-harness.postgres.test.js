import test from 'node:test'
import assert from 'node:assert/strict'
import knex from 'knex'
import { createPostgresTestDb } from '../test/helpers/postgres-test-db.js'

test('harness cleans up after migration and test failures without changing the admin database', async (t) => {
  // Validate the same explicit configuration before opening an observer connection.
  const initial = await createPostgresTestDb()
  const admin = knex({ client: 'pg', connection: process.env.NEBULYNK_TEST_POSTGRES_URL, pool: { min: 0, max: 1 } })
  t.after(() => admin.destroy())
  t.after(() => initial.close())
  const adminName = (await admin.raw('SELECT current_database() AS name')).rows[0].name
  const tablesBefore = await admin('information_schema.tables').where('table_schema', 'public').select('table_name').orderBy('table_name')
  const createdNames = []
  const originalRaw = admin.client.constructor.prototype.query
  // Observe actual CREATE statements on admin connections while preserving real SQL.
  const prototype = admin.client.constructor.prototype
  t.mock.method(prototype, 'query', function (connection, query) {
    const sql = typeof query === 'string' ? query : query.sql
    const match = /^CREATE DATABASE "(nebulynk_test_ap01_[a-z0-9]+)"/.exec(sql)
    if (match) createdNames.push(match[1])
    return originalRaw.call(this, connection, query)
  })
  const migrator = Object.getPrototypeOf(initial.db.migrate)
  const latest = migrator.latest
  t.mock.method(migrator, 'latest', async function () {
    await this.knex.raw('SELECT 1')
    throw new Error('synthetic migration failure')
  })
  await assert.rejects(createPostgresTestDb(), /synthetic migration failure/)
  migrator.latest = latest
  await assert.rejects(async () => {
    const fixture = await createPostgresTestDb()
    try {
      await fixture.db('channels').insert({ id: 'owned-test-row', name: 'Test', type: 'private' })
      throw new Error('synthetic test failure')
    } finally { await fixture.close() }
  }, /synthetic test failure/)
  assert.equal(createdNames.length, 2)
  assert.deepEqual(await admin('pg_database').whereIn('datname', createdNames), [])
  assert.equal((await admin.raw('SELECT current_database() AS name')).rows[0].name, adminName)
  assert.deepEqual(await admin('information_schema.tables').where('table_schema', 'public').select('table_name').orderBy('table_name'), tablesBefore)
})
