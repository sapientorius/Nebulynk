import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import {
  comparePlatformVersions,
  highestSecuritySeverity,
  parseAndVerifyFeedEnvelope,
  validateReleaseDocument,
  verifyReleaseDigest
} from '../src/lib/platform-update-catalog.js'
import { PLATFORM_VERSION } from '../src/lib/build-info.js'
import { PlatformUpdateManager } from '../src/lib/platform-updates.js'
import { createMemoryDb } from './helpers/memory-db.js'

function localized(value) {
  return { de: value, en: value }
}

function release(version, {
  revision = 1,
  security = [],
  publishedAt = '2026-08-01T00:00:00.000Z'
} = {}) {
  return {
    schema_version: 1,
    version,
    revision,
    channel: 'stable',
    published_at: publishedAt,
    title: localized(`Release ${version}`),
    summary: localized(`Summary ${version}`),
    changes: [{ category: 'fix', title: localized('Fix'), description: localized('Details') }],
    security,
    upgrade: {
      backup_required: false,
      downtime_expected: false,
      breaking: false,
      manual_steps: { de: [], en: [] },
      docs_url: 'https://docs.nebulynk.net/update'
    }
  }
}

function advisory(severity, affectedVersions = '<0.3.0') {
  return {
    severity,
    affected_versions: affectedVersions,
    summary: localized(`${severity} advisory`),
    advisory_url: 'https://updates.nebulynk.net/advisories/example'
  }
}

function createSignedFeed(documents) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const files = new Map()
  const descriptors = documents.map((document) => {
    const bytes = Buffer.from(JSON.stringify(document), 'utf8')
    const path = `releases/v${document.version}.json`
    files.set(path, bytes)
    return {
      version: document.version,
      revision: document.revision,
      channel: 'stable',
      published_at: document.published_at,
      path,
      sha256: createHash('sha256').update(bytes).digest('base64url')
    }
  })
  const payload = Buffer.from(JSON.stringify({
    schema_version: 1,
    sequence: documents.length,
    generated_at: '2026-08-01T01:00:00.000Z',
    releases: descriptors
  }), 'utf8')
  return {
    files,
    publicKeys: { 'test-2026': publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    envelope: {
      schema_version: 1,
      key_id: 'test-2026',
      payload: payload.toString('base64url'),
      signature: sign(null, payload, privateKey).toString('base64url')
    }
  }
}

function createMailDb(users) {
  const tables = { users, platform_update_email_deliveries: [] }
  const db = (tableName) => {
    const predicates = []
    const builder = {
      where(values) {
        predicates.push((row) => Object.entries(values).every(([key, value]) => row[key] === value))
        return this
      },
      whereNull(field) {
        predicates.push((row) => row[field] === null || row[field] === undefined)
        return this
      },
      select(...fields) {
        return Promise.resolve(tables[tableName].filter((row) => predicates.every((predicate) => predicate(row))).map((row) => (
          Object.fromEntries(fields.map((field) => [field, row[field]]))
        )))
      },
      insert(value) {
        return {
          onConflict(conflictFields) {
            return {
              async merge(patch) {
                const existing = tables[tableName].find((row) => conflictFields.every((field) => row[field] === value[field]))
                if (!existing) {
                  tables[tableName].push({ ...value })
                  return 1
                }
                const nextPatch = { ...patch }
                if (nextPatch.attempts?.increment) nextPatch.attempts = Number(existing.attempts || 0) + 1
                Object.assign(existing, nextPatch)
                return 1
              }
            }
          }
        }
      },
      then(resolve, reject) {
        return Promise.resolve(tables[tableName].filter((row) => predicates.every((predicate) => predicate(row))).map((row) => ({ ...row }))).then(resolve, reject)
      }
    }
    return builder
  }
  db.raw = () => ({ increment: true })
  db.tables = tables
  return db
}

test('signed feed verification accepts a valid Ed25519 envelope and rejects tampering', () => {
  const signed = createSignedFeed([release('0.2.0')])
  const payload = parseAndVerifyFeedEnvelope(signed.envelope, signed.publicKeys, 0)
  assert.equal(payload.sequence, 1)
  assert.equal(payload.releases[0].version, '0.2.0')

  assert.throws(
    () => parseAndVerifyFeedEnvelope({ ...signed.envelope, signature: 'AAAA' }, signed.publicKeys, 0),
    { message: 'update_feed_signature_invalid' }
  )
  assert.throws(
    () => parseAndVerifyFeedEnvelope({ ...signed.envelope, key_id: 'unknown' }, signed.publicKeys, 0),
    { message: 'update_feed_unknown_key' }
  )
  assert.throws(
    () => parseAndVerifyFeedEnvelope(signed.envelope, signed.publicKeys, 2),
    { message: 'update_feed_sequence_rollback' }
  )
})

test('release validation requires explicit security metadata and validates stable SemVer', () => {
  assert.equal(validateReleaseDocument(release('0.2.0')).version, '0.2.0')
  const missingSecurity = release('0.2.0')
  delete missingSecurity.security
  assert.throws(() => validateReleaseDocument(missingSecurity), { message: 'update_feed_release_security_invalid' })
  assert.throws(() => validateReleaseDocument(release('0.3.0-beta.1')), { message: 'update_feed_release_channel_invalid' })
})

test('SemVer comparison returns every release gap and only applicable security advisories', () => {
  const catalog = {
    releases: [
      release('0.1.0'),
      release('0.2.0'),
      release('0.3.0', { security: [advisory('high', '<0.3.0')] }),
      release('0.4.0', { security: [advisory('critical', '<0.2.0')] })
    ]
  }
  const comparison = comparePlatformVersions('0.1.0', catalog)
  assert.equal(comparison.comparisonStatus, 'security_update_available')
  assert.deepEqual(comparison.releases.map((entry) => entry.version), ['0.2.0', '0.3.0', '0.4.0'])
  assert.equal(comparison.highestSecuritySeverity, 'critical')
  assert.equal(highestSecuritySeverity(catalog.releases, '0.3.0'), null)
})

test('invalid, unknown, prerelease, and feed-ahead builds are never reported as current', () => {
  const catalog = { releases: [release('0.1.0'), release('0.2.0')] }
  assert.equal(comparePlatformVersions('not-semver', catalog).comparisonStatus, 'invalid_build')
  assert.equal(comparePlatformVersions('0.2.0-beta.1', catalog).comparisonStatus, 'invalid_build')
  assert.equal(comparePlatformVersions('0.1.5', catalog).comparisonStatus, 'unknown_build')
  assert.equal(comparePlatformVersions('0.3.0', catalog).comparisonStatus, 'ahead')
  assert.equal(comparePlatformVersions('0.2.0', catalog).comparisonStatus, 'up_to_date')
})

test('release digests reject manipulated files', () => {
  const bytes = Buffer.from('trusted')
  const digest = createHash('sha256').update(bytes).digest('base64url')
  assert.doesNotThrow(() => verifyReleaseDigest(bytes, digest))
  assert.throws(() => verifyReleaseDigest(Buffer.from('tampered'), digest), { message: 'update_feed_release_digest_mismatch' })
})

test('feed client reuses verified cache on 304 and never accepts 304 without cache', async () => {
  const signed = createSignedFeed([release('0.2.0')])
  const app = { get: () => null }
  const manager = new PlatformUpdateManager(app, {
    publicKeys: signed.publicKeys,
    feedBaseUrl: 'https://update.nebulynk.net',
    fetchImpl: async () => new Response(null, { status: 304 })
  })
  const cached = { sequence: 1, releases: [release('0.2.0')] }
  const result = await manager.fetchCatalog({ cached_catalog: cached, feed_etag: '"one"', feed_sequence: 1 })
  assert.deepEqual(result.catalog, cached)
  await assert.rejects(
    manager.fetchCatalog({ cached_catalog: null, feed_etag: '"one"', feed_sequence: 1 }),
    { message: 'update_feed_cache_missing' }
  )
})

test('feed client validates each signed descriptor digest and enforces response limits', async () => {
  const document = release('0.2.0')
  const signed = createSignedFeed([document])
  const manager = new PlatformUpdateManager({ get: () => null }, {
    publicKeys: signed.publicKeys,
    feedBaseUrl: 'https://update.nebulynk.net',
    fetchImpl: async (url) => {
      if (url.pathname.endsWith('/index.json')) {
        return Response.json(signed.envelope, { headers: { ETag: '"two"' } })
      }
      return new Response(signed.files.get('releases/v0.2.0.json'))
    }
  })
  const result = await manager.fetchCatalog({ feed_sequence: 0 })
  assert.equal(result.sequence, 1)
  assert.equal(result.catalog.releases[0].version, '0.2.0')

  const oversized = new PlatformUpdateManager({ get: () => null }, {
    publicKeys: signed.publicKeys,
    feedBaseUrl: 'https://update.nebulynk.net',
    fetchImpl: async () => new Response('{}', { headers: { 'Content-Length': String(300 * 1024) } })
  })
  await assert.rejects(oversized.fetchCatalog({ feed_sequence: 0 }), { message: 'update_feed_response_too_large' })
})

test('concurrent checks keep one lease owner through security delivery', async () => {
  const manager = new PlatformUpdateManager({ get: () => null }, {
    publicKeys: { test: 'unused' },
    feedBaseUrl: 'https://update.nebulynk.net'
  })
  let leaseHeld = false
  let deliveries = 0
  manager.getState = async () => ({ checks_enabled: true })
  manager.acquireLease = async () => {
    if (leaseHeld) return null
    leaseHeld = true
    return 'lease-one'
  }
  manager.prepareInstalledVersion = async () => true
  manager.fetchCatalog = async () => {
    await new Promise((resolve) => setTimeout(resolve, 15))
    return { catalog: { releases: [] }, etag: null, sequence: 1 }
  }
  manager.recordSuccess = async () => true
  manager.deliverSecurityEmails = async () => {
    deliveries += 1
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  manager.releaseLease = async () => { leaseHeld = false }

  const results = await Promise.all([manager.check({ force: true }), manager.check({ force: true })])
  assert.deepEqual(results.sort(), [false, true])
  assert.equal(deliveries, 1)
})

test('security delivery selects active member admins, bundles releases, retries failures, and deduplicates success', async () => {
  const users = [
    { id: 'owner', email: 'owner@example.test', display_name: 'Owner', preferred_locale: 'de', is_admin: true, account_type: 'member', disabled_at: null },
    { id: 'admin', email: 'admin@example.test', display_name: 'Admin', preferred_locale: 'en', is_admin: true, account_type: 'member', disabled_at: null },
    { id: 'disabled', email: 'disabled@example.test', is_admin: true, account_type: 'member', disabled_at: '2026-08-01T00:00:00.000Z' },
    { id: 'member', email: 'member@example.test', is_admin: false, account_type: 'member', disabled_at: null }
  ]
  const db = createMailDb(users)
  const calls = []
  let failOwnerOnce = true
  const app = { get: (key) => key === 'postgresqlClient' ? db : null }
  const manager = new PlatformUpdateManager(app, {
    publicKeys: { test: 'unused' },
    feedBaseUrl: 'https://update.nebulynk.net',
    sendSecurityEmail: async (_app, payload) => {
      calls.push(payload)
      if (payload.user.id === 'owner' && failOwnerOnce) {
        failOwnerOnce = false
        return { ok: false, errorCode: 'api.smtp.delivery_failed' }
      }
      return { ok: true }
    },
    now: () => new Date('2026-08-01T12:00:00.000Z')
  })
  manager.getState = async () => ({ checks_enabled: true, lease_token: 'mail-lease' })
  manager.renewDeliveryLease = async () => true
  const catalog = {
    releases: [
      release('0.2.0'),
      release(PLATFORM_VERSION),
      release('0.3.0', { security: [advisory('low', '<0.3.0')] }),
      release('0.4.0', { security: [advisory('critical', '<0.4.0')] })
    ]
  }

  await manager.deliverSecurityEmails(catalog, 'mail-lease')
  assert.deepEqual(calls.map((call) => call.user.id).sort(), ['admin', 'owner'])
  assert.ok(calls.every((call) => call.releases.length === 2))
  assert.equal(db.tables.platform_update_email_deliveries.filter((row) => row.status === 'sent').length, 2)

  await manager.deliverSecurityEmails(catalog, 'mail-lease')
  assert.equal(calls.filter((call) => call.user.id === 'admin').length, 1)
  assert.equal(calls.filter((call) => call.user.id === 'owner').length, 2)
  assert.equal(db.tables.platform_update_email_deliveries.filter((row) => row.status === 'sent').length, 4)

  await manager.deliverSecurityEmails(catalog, 'mail-lease')
  assert.equal(calls.length, 3)
})

test('a detected downgrade invalidates old acknowledgements and security delivery deduplication before fetching', async () => {
  const db = createMemoryDb({
    platform_update_state: [{ id: 'default', lease_token: 'downgrade-lease', observed_version: '0.4.0' }],
    platform_update_acknowledgements: [{ id: 1, installed_version: '0.2.0' }],
    platform_update_email_deliveries: [{ id: 1, installed_version: '0.2.0', status: 'sent' }]
  })
  const manager = new PlatformUpdateManager({ get: (key) => key === 'postgresqlClient' ? db : null }, {
    publicKeys: { test: 'unused' },
    feedBaseUrl: 'https://update.nebulynk.net',
    now: () => new Date('2026-08-01T12:00:00.000Z')
  })
  const state = await manager.getState()

  assert.equal(await manager.prepareInstalledVersion('downgrade-lease', state), true)
  assert.equal(db.tables.platform_update_state[0].observed_version, PLATFORM_VERSION)
  assert.equal(db.tables.platform_update_acknowledgements.length, 0)
  assert.equal(db.tables.platform_update_email_deliveries.length, 0)
})

test('a failed fetch keeps the verified cache and still retries pending security mail under the lease', async () => {
  const cachedCatalog = { releases: [release('0.2.0'), release('0.3.0', { security: [advisory('high')] })] }
  const manager = new PlatformUpdateManager({ get: () => null }, {
    publicKeys: { test: 'unused' },
    feedBaseUrl: 'https://update.nebulynk.net',
    log: { warn() {}, error() {} }
  })
  let retainedLease = false
  let deliveries = 0
  let released = false
  manager.getState = async () => ({ checks_enabled: true, cached_catalog: cachedCatalog })
  manager.acquireLease = async () => 'cache-lease'
  manager.prepareInstalledVersion = async () => true
  manager.fetchCatalog = async () => { throw Object.assign(new Error('offline'), { code: 'update_feed_unavailable' }) }
  manager.recordFailure = async (_token, _state, _error, options) => {
    retainedLease = options.retainLease
    return true
  }
  manager.deliverSecurityEmails = async (catalog, token) => {
    assert.equal(catalog, cachedCatalog)
    assert.equal(token, 'cache-lease')
    deliveries += 1
  }
  manager.releaseLease = async () => { released = true }

  assert.equal(await manager.check({ force: true }), false)
  assert.equal(retainedLease, true)
  assert.equal(deliveries, 1)
  assert.equal(released, true)
})
