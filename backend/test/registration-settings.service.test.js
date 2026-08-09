import test from 'node:test'
import assert from 'node:assert/strict'
import { RegistrationSettingsService } from '../src/services/registration-settings/registration-settings.js'
import { SecuritySettingsService } from '../src/services/security-settings/security-settings.js'
import { createMemoryDb } from './helpers/memory-db.js'

function createApp(db) {
  return {
    get(key) {
      assert.equal(key, 'postgresqlClient')
      return db
    }
  }
}

test('registration settings save normalized domains and preserve all-or-nothing updates', async () => {
  const db = createMemoryDb({
    platform_settings: [
      { key: 'self_registration_enabled', value: 'false' },
      { key: 'self_registration_allowed_domains', value: '[]' },
      { key: 'self_registration_requires_admin_approval', value: 'false' }
    ]
  })
  const service = new RegistrationSettingsService(createApp(db))

  const updated = await service.patch('default', {
    enabled: true,
    allowed_domains: ['Example.COM.', 'bücher.example', 'example.com'],
    requires_admin_approval: true
  })

  assert.equal(updated.enabled, true)
  assert.deepEqual(updated.allowed_domains, ['example.com', 'xn--bcher-kva.example'])
  assert.equal(updated.requires_admin_approval, true)

  await assert.rejects(
    service.patch('default', {
      enabled: false,
      allowed_domains: ['not/a-domain']
    }),
    (error) => {
      assert.equal(error.error_code, 'api.self_registration.invalid_allowed_domain')
      return true
    }
  )

  const unchanged = await service.find()
  assert.equal(unchanged.enabled, true)
  assert.deepEqual(unchanged.allowed_domains, ['example.com', 'xn--bcher-kva.example'])
})

test('security settings persist the selected password strength level', async () => {
  const db = createMemoryDb({
    platform_settings: [{ key: 'password_strength_level', value: 'basic' }]
  })
  const service = new SecuritySettingsService(createApp(db))

  assert.deepEqual(await service.find(), {
    level: 'basic',
    min_length: 8,
    min_types: 2
  })
  assert.deepEqual(await service.patch('default', {
    password_strength_level: 'very_strong'
  }), {
    level: 'very_strong',
    min_length: 10,
    min_types: 3
  })
})
