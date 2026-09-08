import test from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresTestDb } from './helpers/postgres-test-db.js'

test('PostgreSQL harness rejects missing isolation and invalid targets before connecting', async (t) => {
  const url = process.env.NEBULYNK_TEST_POSTGRES_URL
  const isolated = process.env.NEBULYNK_TEST_POSTGRES_ISOLATED
  t.after(() => {
    if (url === undefined) delete process.env.NEBULYNK_TEST_POSTGRES_URL
    else process.env.NEBULYNK_TEST_POSTGRES_URL = url
    if (isolated === undefined) delete process.env.NEBULYNK_TEST_POSTGRES_ISOLATED
    else process.env.NEBULYNK_TEST_POSTGRES_ISOLATED = isolated
  })
  delete process.env.NEBULYNK_TEST_POSTGRES_URL
  await assert.rejects(createPostgresTestDb(), /NEBULYNK_TEST_POSTGRES_URL/)
  process.env.NEBULYNK_TEST_POSTGRES_URL = 'postgresql://unused:unused@127.0.0.1:1/postgres'
  delete process.env.NEBULYNK_TEST_POSTGRES_ISOLATED
  await assert.rejects(createPostgresTestDb(), /NEBULYNK_TEST_POSTGRES_ISOLATED/)
  process.env.NEBULYNK_TEST_POSTGRES_ISOLATED = 'true'
  process.env.NEBULYNK_TEST_POSTGRES_URL = 'https://test.invalid/database'
  await assert.rejects(createPostgresTestDb(), /PostgreSQL URL/)
  process.env.NEBULYNK_TEST_POSTGRES_URL = 'postgresql://unused:unused@127.0.0.1:1/postgres'
  await assert.rejects(createPostgresTestDb({ migrationTarget: '../invalid.js' }), /Unknown test migration target/)
})
