import test from 'node:test'
import assert from 'node:assert/strict'
import { feathers } from '@feathersjs/feathers'
import { KlipySettings } from '../src/lib/klipy-settings.js'
import { PlatformRepository } from '../src/domains/platform/repository.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createSettings(env = {}) {
  const db = createMemoryDb()
  const app = feathers()
  app.set('authentication', { secret: 'test-auth-secret' })
  const settings = new KlipySettings({
    repository: new PlatformRepository(db),
    app,
    env
  })
  return { db, settings }
}

test('Klipy settings: falls back to KLIPY_API_KEY when no platform key exists', async () => {
  const { settings } = createSettings({ KLIPY_API_KEY: 'env-key' })

  assert.equal(await settings.resolveApiKey(), 'env-key')
  assert.deepEqual(await settings.getStatus(), { klipy_configured: true })
})

test('Klipy settings: encrypted platform key overrides environment fallback', async () => {
  const { db, settings } = createSettings({ KLIPY_API_KEY: 'env-key' })

  await settings.setApiKey('platform-key')

  assert.equal(await settings.resolveApiKey(), 'platform-key')
  assert.deepEqual(await settings.getStatus(), { klipy_configured: true })
  assert.equal(db.tables.platform_secrets.length, 1)
  assert.notEqual(db.tables.platform_secrets[0].encrypted_value, 'platform-key')
})

test('Klipy settings: clearing the platform key restores the environment fallback', async () => {
  const { db, settings } = createSettings({ KLIPY_API_KEY: 'env-key' })

  await settings.setApiKey('platform-key')
  await settings.clearApiKey()

  assert.equal(await settings.resolveApiKey(), 'env-key')
  assert.deepEqual(await settings.getStatus(), { klipy_configured: true })
  assert.equal(db.tables.platform_secrets.length, 0)
})

test('Klipy settings: no configured key disables the integration', async () => {
  const { settings } = createSettings({ KLIPY_API_KEY: '' })

  assert.equal(await settings.resolveApiKey(), '')
  assert.deepEqual(await settings.getStatus(), { klipy_configured: false })
})
