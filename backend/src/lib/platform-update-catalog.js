import { createHash, createPublicKey, verify } from 'node:crypto'
import semver from 'semver'

export const UPDATE_FEED_SCHEMA_VERSION = 1
export const UPDATE_SEVERITY_ORDER = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 })
const RELEASE_CATEGORIES = new Set(['feature', 'improvement', 'fix', 'breaking', 'security'])
const MAX_RELEASES = 500

function assertCatalog(condition, code) {
  if (!condition) {
    const error = new Error(code)
    error.code = code
    throw error
  }
}

function assertLocalizedText(value) {
  assertCatalog(value && typeof value === 'object', 'update_feed_invalid_localized_text')
  assertCatalog(typeof value.en === 'string' && value.en.trim(), 'update_feed_invalid_localized_text')
  if (value.de !== undefined) assertCatalog(typeof value.de === 'string' && value.de.trim(), 'update_feed_invalid_localized_text')
}

function assertManualSteps(value) {
  assertCatalog(value && typeof value === 'object', 'update_feed_release_upgrade_invalid')
  assertCatalog(Array.isArray(value.en), 'update_feed_release_upgrade_invalid')
  assertCatalog(value.en.every((entry) => typeof entry === 'string' && entry.trim()), 'update_feed_release_upgrade_invalid')
  if (value.de !== undefined) {
    assertCatalog(Array.isArray(value.de), 'update_feed_release_upgrade_invalid')
    assertCatalog(value.de.every((entry) => typeof entry === 'string' && entry.trim()), 'update_feed_release_upgrade_invalid')
  }
}

function assertHttpsUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw Object.assign(new Error('update_feed_invalid_url'), { code: 'update_feed_invalid_url' })
  }
  assertCatalog(parsed.protocol === 'https:', 'update_feed_invalid_url')
}

export function validateReleaseDocument(document, descriptor = null) {
  assertCatalog(document?.schema_version === UPDATE_FEED_SCHEMA_VERSION, 'update_feed_release_schema_invalid')
  assertCatalog(semver.valid(document.version) === document.version, 'update_feed_release_version_invalid')
  assertCatalog(!semver.prerelease(document.version) && document.channel === 'stable', 'update_feed_release_channel_invalid')
  assertCatalog(Number.isInteger(document.revision) && document.revision > 0, 'update_feed_release_revision_invalid')
  assertCatalog(!Number.isNaN(Date.parse(document.published_at)), 'update_feed_release_date_invalid')
  if (descriptor) {
    assertCatalog(document.version === descriptor.version, 'update_feed_release_descriptor_mismatch')
    assertCatalog(document.revision === descriptor.revision, 'update_feed_release_descriptor_mismatch')
    assertCatalog(document.published_at === descriptor.published_at, 'update_feed_release_descriptor_mismatch')
  }
  assertLocalizedText(document.title)
  assertLocalizedText(document.summary)
  assertCatalog(Array.isArray(document.changes), 'update_feed_release_changes_invalid')
  for (const change of document.changes) {
    assertCatalog(RELEASE_CATEGORIES.has(change?.category), 'update_feed_release_change_category_invalid')
    assertLocalizedText(change.title)
    assertLocalizedText(change.description)
  }
  assertCatalog(Array.isArray(document.security), 'update_feed_release_security_invalid')
  for (const advisory of document.security) {
    assertCatalog(Object.hasOwn(UPDATE_SEVERITY_ORDER, advisory?.severity), 'update_feed_release_security_severity_invalid')
    assertCatalog(typeof advisory.affected_versions === 'string' && semver.validRange(advisory.affected_versions), 'update_feed_release_security_range_invalid')
    assertLocalizedText(advisory.summary)
    if (advisory.advisory_url) assertHttpsUrl(advisory.advisory_url)
  }
  assertCatalog(document.upgrade && typeof document.upgrade === 'object', 'update_feed_release_upgrade_invalid')
  for (const field of ['backup_required', 'downtime_expected', 'breaking']) {
    assertCatalog(typeof document.upgrade[field] === 'boolean', 'update_feed_release_upgrade_invalid')
  }
  assertManualSteps(document.upgrade.manual_steps)
  assertHttpsUrl(document.upgrade.docs_url)
  return document
}

export function parseAndVerifyFeedEnvelope(envelope, publicKeys, minimumSequence = 0) {
  assertCatalog(envelope?.schema_version === UPDATE_FEED_SCHEMA_VERSION, 'update_feed_envelope_schema_invalid')
  assertCatalog(typeof envelope.key_id === 'string' && envelope.key_id, 'update_feed_key_id_missing')
  assertCatalog(typeof envelope.payload === 'string' && envelope.payload, 'update_feed_payload_missing')
  assertCatalog(typeof envelope.signature === 'string' && envelope.signature, 'update_feed_signature_missing')
  const publicKey = publicKeys?.[envelope.key_id]
  assertCatalog(typeof publicKey === 'string' && publicKey, 'update_feed_unknown_key')

  const payloadBytes = Buffer.from(envelope.payload, 'base64url')
  const signatureBytes = Buffer.from(envelope.signature, 'base64url')
  assertCatalog(verify(null, payloadBytes, createPublicKey(publicKey), signatureBytes), 'update_feed_signature_invalid')

  let payload
  try {
    payload = JSON.parse(payloadBytes.toString('utf8'))
  } catch {
    throw Object.assign(new Error('update_feed_payload_invalid'), { code: 'update_feed_payload_invalid' })
  }
  assertCatalog(payload?.schema_version === UPDATE_FEED_SCHEMA_VERSION, 'update_feed_payload_schema_invalid')
  assertCatalog(Number.isInteger(payload.sequence) && payload.sequence >= minimumSequence, 'update_feed_sequence_rollback')
  assertCatalog(!Number.isNaN(Date.parse(payload.generated_at)), 'update_feed_generated_at_invalid')
  assertCatalog(Array.isArray(payload.releases) && payload.releases.length <= MAX_RELEASES, 'update_feed_release_index_invalid')

  let previousVersion = null
  for (const descriptor of payload.releases) {
    assertCatalog(semver.valid(descriptor?.version) === descriptor.version, 'update_feed_release_index_invalid')
    assertCatalog(!semver.prerelease(descriptor.version) && descriptor.channel === 'stable', 'update_feed_release_index_invalid')
    assertCatalog(Number.isInteger(descriptor.revision) && descriptor.revision > 0, 'update_feed_release_index_invalid')
    assertCatalog(!Number.isNaN(Date.parse(descriptor.published_at)), 'update_feed_release_index_invalid')
    assertCatalog(descriptor.path === `releases/v${descriptor.version}.json`, 'update_feed_release_path_invalid')
    assertCatalog(typeof descriptor.sha256 === 'string' && /^[A-Za-z0-9_-]{43}$/.test(descriptor.sha256), 'update_feed_release_digest_invalid')
    assertCatalog(!previousVersion || semver.gt(descriptor.version, previousVersion), 'update_feed_release_order_invalid')
    previousVersion = descriptor.version
  }
  return payload
}

export function verifyReleaseDigest(bytes, expectedDigest) {
  const actual = createHash('sha256').update(bytes).digest('base64url')
  assertCatalog(actual === expectedDigest, 'update_feed_release_digest_mismatch')
}

export function normalizeCachedCatalog(value) {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

export function isSecurityAdvisoryApplicable(advisory, currentVersion) {
  return Boolean(semver.valid(currentVersion) && semver.satisfies(currentVersion, advisory.affected_versions, { includePrerelease: false }))
}

export function highestSecuritySeverity(releases, currentVersion) {
  let highest = null
  for (const release of releases || []) {
    for (const advisory of release.security || []) {
      if (!isSecurityAdvisoryApplicable(advisory, currentVersion)) continue
      if (!highest || UPDATE_SEVERITY_ORDER[advisory.severity] > UPDATE_SEVERITY_ORDER[highest]) {
        highest = advisory.severity
      }
    }
  }
  return highest
}

export function comparePlatformVersions(currentVersion, catalog) {
  const releases = Array.isArray(catalog?.releases) ? catalog.releases : []
  if (!semver.valid(currentVersion) || semver.prerelease(currentVersion)) {
    return { comparisonStatus: 'invalid_build', latestVersion: releases.at(-1)?.version || null, releases: [], highestSecuritySeverity: null }
  }
  const latestVersion = releases.at(-1)?.version || null
  if (!latestVersion) {
    return { comparisonStatus: 'unknown', latestVersion: null, releases: [], highestSecuritySeverity: null }
  }
  if (semver.gt(currentVersion, latestVersion)) {
    return { comparisonStatus: 'ahead', latestVersion, releases: [], highestSecuritySeverity: null }
  }
  if (!releases.some((release) => release.version === currentVersion)) {
    return { comparisonStatus: 'unknown_build', latestVersion, releases: [], highestSecuritySeverity: null }
  }
  const outstanding = releases.filter((release) => semver.gt(release.version, currentVersion) && semver.lte(release.version, latestVersion))
  if (outstanding.length === 0) {
    return { comparisonStatus: 'up_to_date', latestVersion, releases: [], highestSecuritySeverity: null }
  }
  const severity = highestSecuritySeverity(outstanding, currentVersion)
  return {
    comparisonStatus: severity ? 'security_update_available' : 'update_available',
    latestVersion,
    releases: outstanding,
    highestSecuritySeverity: severity
  }
}
