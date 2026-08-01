import { randomUUID } from 'node:crypto'
import semver from 'semver'
import { logger } from '../logger.js'
import { resolveEffectiveSmtpConfig, sendPlatformSecurityUpdateEmail } from '../email.js'
import { getPlatformBuildInfo, PLATFORM_VERSION } from './build-info.js'
import {
  comparePlatformVersions,
  isSecurityAdvisoryApplicable,
  normalizeCachedCatalog,
  parseAndVerifyFeedEnvelope,
  UPDATE_SEVERITY_ORDER,
  validateReleaseDocument,
  verifyReleaseDigest
} from './platform-update-catalog.js'
import { resolvePlatformUpdatePublicKeys } from './platform-update-keys.js'

export const PLATFORM_UPDATE_STATE_ID = 'default'
export const PLATFORM_UPDATE_INTERVAL_MS = 60 * 60 * 1000
export const PLATFORM_UPDATE_STALE_AFTER_MS = 6 * 60 * 60 * 1000
export const PLATFORM_UPDATE_CHECK_TIMEOUT_MS = 10_000
export const PLATFORM_UPDATE_LEASE_MS = 2 * 60 * 1000
export const PLATFORM_UPDATE_DELIVERY_LEASE_MS = 30 * 60 * 1000
export const PLATFORM_UPDATE_MAX_INDEX_BYTES = 256 * 1024
export const PLATFORM_UPDATE_MAX_RELEASE_BYTES = 128 * 1024
const PLATFORM_UPDATE_MAX_BACKOFF_MS = 6 * 60 * 60 * 1000
const PLATFORM_UPDATE_SCHEDULER_TICK_MS = 60_000
const DEFAULT_FEED_BASE_URL = 'https://updates.nebulynk.net/v1/'

function asIso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function asTime(value) {
  const iso = asIso(value)
  return iso ? new Date(iso).getTime() : 0
}

function normalizedErrorCode(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  return code.startsWith('update_feed_') || code.startsWith('platform_update_')
    ? code
    : 'update_feed_unavailable'
}

function withoutInternalFeedFields(release) {
  if (!release || typeof release !== 'object') return release
  const { _feed_sha256: ignored, ...publicRelease } = release
  return publicRelease
}

function getCheckStatus(state, now = new Date()) {
  if (state?.checks_enabled === false) return 'disabled'
  if (state?.lease_expires_at && asTime(state.lease_expires_at) > now.getTime()) return 'checking'
  if (!state?.last_attempt_at) return 'never'
  if (state.last_error_code && asTime(state.last_attempt_at) >= asTime(state.last_success_at)) return 'failed'
  return 'ok'
}

async function readResponseBytes(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error('update_feed_response_too_large'), { code: 'update_feed_response_too_large' })
  }

  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw Object.assign(new Error('update_feed_response_too_large'), { code: 'update_feed_response_too_large' })
    return bytes
  }

  const reader = response.body.getReader()
  const chunks = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maxBytes) {
      await reader.cancel().catch(() => {})
      throw Object.assign(new Error('update_feed_response_too_large'), { code: 'update_feed_response_too_large' })
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, length)
}

function parseJsonBytes(bytes, code) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw Object.assign(new Error(code), { code })
  }
}

function resolveFeedBaseUrl(env, explicitUrl) {
  const candidate = explicitUrl || (env.NODE_ENV === 'production' ? DEFAULT_FEED_BASE_URL : env.NEBULYNK_UPDATE_FEED_URL || DEFAULT_FEED_BASE_URL)
  const parsed = new URL(candidate)
  if (env.NODE_ENV === 'production' && parsed.href !== DEFAULT_FEED_BASE_URL) {
    throw Object.assign(new Error('update_feed_url_invalid'), { code: 'update_feed_url_invalid' })
  }
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/'
  return parsed
}

export function buildPlatformUpdateResponse({ state, catalog, acknowledgements = [], user, emailConfigured = false, emailDeliveryFailed = false, now = new Date() }) {
  const comparison = comparePlatformVersions(PLATFORM_VERSION, catalog)
  const acknowledgementKeys = new Set(acknowledgements.map((entry) => (
    `${entry.installed_version}:${entry.release_version}:${entry.release_revision}`
  )))
  const releases = comparison.releases.map((release) => {
    const applicableSecurity = (release.security || []).filter((advisory) => isSecurityAdvisoryApplicable(advisory, PLATFORM_VERSION))
    const releaseSeverity = applicableSecurity.reduce((highest, advisory) => (
      !highest || UPDATE_SEVERITY_ORDER[advisory.severity] > UPDATE_SEVERITY_ORDER[highest]
        ? advisory.severity
        : highest
    ), null)
    return {
      ...withoutInternalFeedFields(release),
      security_applicable: applicableSecurity.length > 0,
      highest_security_severity: releaseSeverity,
      acknowledged: acknowledgementKeys.has(`${PLATFORM_VERSION}:${release.version}:${release.revision}`)
    }
  })
  const lastSuccessAt = asIso(state?.last_success_at)
  return {
    build: getPlatformBuildInfo(),
    checks_enabled: state?.checks_enabled !== false,
    can_manage_checks: user?.is_primary_admin === true,
    check_status: getCheckStatus(state, now),
    comparison_status: comparison.comparisonStatus,
    latest_version: comparison.latestVersion,
    update_count: releases.length,
    security_update_count: releases.filter((release) => release.security_applicable).length,
    highest_security_severity: comparison.highestSecuritySeverity,
    last_attempt_at: asIso(state?.last_attempt_at),
    last_success_at: lastSuccessAt,
    cache_stale: !lastSuccessAt || now.getTime() - new Date(lastSuccessAt).getTime() > PLATFORM_UPDATE_STALE_AFTER_MS,
    last_error_code: state?.last_error_code || null,
    security_email_configured: emailConfigured,
    security_email_status: !emailConfigured ? 'unconfigured' : emailDeliveryFailed ? 'delivery_failed' : 'available',
    releases
  }
}

export class PlatformUpdateManager {
  constructor(app, {
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    random = Math.random,
    feedBaseUrl = null,
    publicKeys = null,
    sendSecurityEmail = sendPlatformSecurityUpdateEmail,
    log = logger
  } = {}) {
    this.app = app
    this.db = app.get('postgresqlClient')
    this.fetchImpl = fetchImpl
    this.now = now
    this.random = random
    this.feedBaseUrl = resolveFeedBaseUrl(process.env, feedBaseUrl)
    this.publicKeys = publicKeys || resolvePlatformUpdatePublicKeys(process.env)
    this.sendSecurityEmail = sendSecurityEmail
    this.log = log
    this.timer = null
  }

  async getState() {
    return this.db('platform_update_state').where('id', PLATFORM_UPDATE_STATE_ID).first()
  }

  async getStatus(user) {
    const [state, acknowledgements, smtpConfig, failedDelivery] = await Promise.all([
      this.getState(),
      this.db('platform_update_acknowledgements')
        .where({ user_id: user.id, installed_version: PLATFORM_VERSION }),
      resolveEffectiveSmtpConfig(this.app).catch(() => null),
      user.is_primary_admin === true
        ? this.db('platform_update_email_deliveries')
          .where({ installed_version: PLATFORM_VERSION, status: 'failed' })
          .first('id')
        : Promise.resolve(null)
    ])
    return buildPlatformUpdateResponse({
      state,
      catalog: normalizeCachedCatalog(state?.cached_catalog),
      acknowledgements,
      user,
      emailConfigured: Boolean(smtpConfig),
      emailDeliveryFailed: Boolean(failedDelivery),
      now: this.now()
    })
  }

  async acquireLease({ force = false } = {}) {
    const now = this.now()
    const leaseToken = randomUUID()
    const query = this.db('platform_update_state')
      .where({ id: PLATFORM_UPDATE_STATE_ID, checks_enabled: true })
      .where((builder) => builder.whereNull('lease_expires_at').orWhere('lease_expires_at', '<=', now.toISOString()))
    if (!force) {
      query.where((builder) => builder.whereNull('next_check_at').orWhere('next_check_at', '<=', now.toISOString()))
    }
    const updated = await query.update({
      lease_token: leaseToken,
      lease_expires_at: new Date(now.getTime() + PLATFORM_UPDATE_LEASE_MS).toISOString(),
      updated_at: now.toISOString()
    })
    return updated > 0 ? leaseToken : null
  }

  async fetchCatalog(state) {
    if (Object.keys(this.publicKeys).length === 0) {
      throw Object.assign(new Error('update_feed_keyring_empty'), { code: 'update_feed_keyring_empty' })
    }
    const headers = { Accept: 'application/json', 'User-Agent': 'Nebulynk-Update-Checker/1' }
    if (state?.feed_etag) headers['If-None-Match'] = state.feed_etag
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PLATFORM_UPDATE_CHECK_TIMEOUT_MS)
    try {
      const indexResponse = await this.fetchImpl(new URL('index.json', this.feedBaseUrl), {
        method: 'GET', headers, redirect: 'error', signal: controller.signal
      })
      const cachedCatalog = normalizeCachedCatalog(state?.cached_catalog)
      if (indexResponse.status === 304) {
        if (!cachedCatalog) throw Object.assign(new Error('update_feed_cache_missing'), { code: 'update_feed_cache_missing' })
        return { catalog: cachedCatalog, etag: state.feed_etag, sequence: Number(state.feed_sequence) || 0 }
      }
      if (indexResponse.status !== 200) {
        throw Object.assign(new Error('update_feed_http_error'), { code: 'update_feed_http_error' })
      }

      const indexBytes = await readResponseBytes(indexResponse, PLATFORM_UPDATE_MAX_INDEX_BYTES)
      const envelope = parseJsonBytes(indexBytes, 'update_feed_envelope_invalid')
      const payload = parseAndVerifyFeedEnvelope(envelope, this.publicKeys, Number(state?.feed_sequence) || 0)
      const cachedByVersion = new Map((cachedCatalog?.releases || []).map((release) => [release.version, release]))
      const releases = []
      for (const descriptor of payload.releases) {
        const cachedRelease = cachedByVersion.get(descriptor.version)
        if (cachedRelease?._feed_sha256 === descriptor.sha256 && cachedRelease.revision === descriptor.revision) {
          releases.push(cachedRelease)
          continue
        }
        const response = await this.fetchImpl(new URL(descriptor.path, this.feedBaseUrl), {
          method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Nebulynk-Update-Checker/1' }, redirect: 'error', signal: controller.signal
        })
        if (response.status !== 200) throw Object.assign(new Error('update_feed_release_http_error'), { code: 'update_feed_release_http_error' })
        const bytes = await readResponseBytes(response, PLATFORM_UPDATE_MAX_RELEASE_BYTES)
        verifyReleaseDigest(bytes, descriptor.sha256)
        const release = validateReleaseDocument(parseJsonBytes(bytes, 'update_feed_release_json_invalid'), descriptor)
        releases.push({ ...release, _feed_sha256: descriptor.sha256 })
      }
      return {
        catalog: { sequence: payload.sequence, generated_at: payload.generated_at, releases },
        etag: indexResponse.headers?.get?.('etag') || null,
        sequence: payload.sequence
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('update_feed_timeout'), { code: 'update_feed_timeout' })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  async prepareInstalledVersion(leaseToken, state) {
    const previousVersion = state?.observed_version
    const downgraded = semver.valid(previousVersion) && semver.valid(PLATFORM_VERSION) && semver.lt(PLATFORM_VERSION, previousVersion)
    const nowIso = this.now().toISOString()
    const owned = await this.db.transaction(async (trx) => {
      const updated = await trx('platform_update_state')
        .where({ id: PLATFORM_UPDATE_STATE_ID, lease_token: leaseToken })
        .update({ observed_version: PLATFORM_VERSION, updated_at: nowIso })
      if (updated > 0 && downgraded) {
        await trx('platform_update_acknowledgements').del()
        await trx('platform_update_email_deliveries').del()
      }
      return updated > 0
    })
    if (owned && state) state.observed_version = PLATFORM_VERSION
    return owned
  }

  async recordSuccess(leaseToken, state, result) {
    const now = this.now()
    const jitterMs = Math.floor(this.random() * 5 * 60 * 1000)
    return this.db.transaction(async (trx) => {
      const updated = await trx('platform_update_state')
        .where({ id: PLATFORM_UPDATE_STATE_ID, lease_token: leaseToken })
        .update({
          observed_version: PLATFORM_VERSION,
          cached_catalog: JSON.stringify(result.catalog),
          feed_etag: result.etag,
          feed_sequence: result.sequence,
          last_attempt_at: now.toISOString(),
          last_success_at: now.toISOString(),
          last_error_code: null,
          consecutive_failures: 0,
          next_check_at: new Date(now.getTime() + PLATFORM_UPDATE_INTERVAL_MS + jitterMs).toISOString(),
          lease_expires_at: new Date(now.getTime() + PLATFORM_UPDATE_DELIVERY_LEASE_MS).toISOString(),
          updated_at: now.toISOString()
        })
      return updated > 0
    })
  }

  async releaseLease(leaseToken) {
    const nowIso = this.now().toISOString()
    await this.db('platform_update_state')
      .where({ id: PLATFORM_UPDATE_STATE_ID, lease_token: leaseToken })
      .update({ lease_token: null, lease_expires_at: null, updated_at: nowIso })
  }

  async renewDeliveryLease(leaseToken) {
    const now = this.now()
    const updated = await this.db('platform_update_state')
      .where({ id: PLATFORM_UPDATE_STATE_ID, lease_token: leaseToken, checks_enabled: true })
      .update({
        lease_expires_at: new Date(now.getTime() + PLATFORM_UPDATE_DELIVERY_LEASE_MS).toISOString(),
        updated_at: now.toISOString()
      })
    return updated > 0
  }

  async recordFailure(leaseToken, state, error, { retainLease = false } = {}) {
    const now = this.now()
    const failures = Math.max(0, Number(state?.consecutive_failures) || 0) + 1
    const delay = Math.min(PLATFORM_UPDATE_MAX_BACKOFF_MS, PLATFORM_UPDATE_INTERVAL_MS * (2 ** Math.min(failures - 1, 3)))
    const updated = await this.db('platform_update_state')
      .where({ id: PLATFORM_UPDATE_STATE_ID, lease_token: leaseToken })
      .update({
        last_attempt_at: now.toISOString(),
        last_error_code: normalizedErrorCode(error),
        consecutive_failures: failures,
        next_check_at: new Date(now.getTime() + delay).toISOString(),
        lease_token: retainLease ? leaseToken : null,
        lease_expires_at: retainLease ? new Date(now.getTime() + PLATFORM_UPDATE_DELIVERY_LEASE_MS).toISOString() : null,
        updated_at: now.toISOString()
      })
    return updated > 0
  }

  async deliverSecurityEmails(catalog, leaseToken) {
    const ownedState = await this.getState()
    if (ownedState?.checks_enabled === false || ownedState?.lease_token !== leaseToken) return
    const comparison = comparePlatformVersions(PLATFORM_VERSION, catalog)
    const securityReleases = comparison.releases.filter((release) => (
      (release.security || []).some((advisory) => isSecurityAdvisoryApplicable(advisory, PLATFORM_VERSION))
    ))
    if (securityReleases.length === 0) return

    const users = await this.db('users')
      .where({ is_admin: true, account_type: 'member' })
      .whereNull('disabled_at')
      .select('id', 'email', 'display_name', 'preferred_locale')
    for (const user of users) {
      if (!await this.renewDeliveryLease(leaseToken)) return
      const sent = await this.db('platform_update_email_deliveries')
        .where({ user_id: user.id, installed_version: PLATFORM_VERSION, status: 'sent' })
      const sentKeys = new Set(sent.map((entry) => `${entry.release_version}:${entry.release_revision}`))
      const pending = securityReleases.filter((release) => !sentKeys.has(`${release.version}:${release.revision}`))
      if (pending.length === 0) continue

      const result = await this.sendSecurityEmail(this.app, {
        user,
        releases: pending.map((release) => ({
          ...withoutInternalFeedFields(release),
          security: (release.security || []).filter((advisory) => isSecurityAdvisoryApplicable(advisory, PLATFORM_VERSION))
        })),
        currentVersion: PLATFORM_VERSION,
        latestVersion: comparison.latestVersion
      })
      const attemptAt = this.now().toISOString()
      for (const release of pending) {
        const row = {
          user_id: user.id,
          installed_version: PLATFORM_VERSION,
          release_version: release.version,
          release_revision: release.revision,
          status: result?.ok ? 'sent' : 'failed',
          attempts: 1,
          last_error_code: result?.ok ? null : result?.errorCode || 'api.smtp.delivery_failed',
          last_attempt_at: attemptAt,
          sent_at: result?.ok ? attemptAt : null,
          updated_at: attemptAt
        }
        await this.db('platform_update_email_deliveries')
          .insert({ ...row, created_at: attemptAt })
          .onConflict(['user_id', 'installed_version', 'release_version', 'release_revision'])
          .merge({
            status: row.status,
            attempts: this.db.raw('platform_update_email_deliveries.attempts + 1'),
            last_error_code: row.last_error_code,
            last_attempt_at: row.last_attempt_at,
            sent_at: row.sent_at,
            updated_at: row.updated_at
          })
      }
    }
  }

  async check({ force = false, throwIfDisabled = false } = {}) {
    const initialState = await this.getState()
    if (initialState?.checks_enabled === false) {
      if (throwIfDisabled) throw Object.assign(new Error('platform_update_checks_disabled'), { code: 'platform_update_checks_disabled' })
      return false
    }
    const leaseToken = await this.acquireLease({ force })
    if (!leaseToken) return false
    const state = await this.getState()
    try {
      if (!await this.prepareInstalledVersion(leaseToken, state)) return false
      const result = await this.fetchCatalog(state)
      const stillOwnsLease = await this.recordSuccess(leaseToken, state, result)
      if (!stillOwnsLease) return false
      try {
        await this.deliverSecurityEmails(result.catalog, leaseToken).catch((error) => {
          this.log.error('Platform security update email processing failed', { error: error.message })
        })
      } finally {
        await this.releaseLease(leaseToken)
      }
      return true
    } catch (error) {
      const cachedCatalog = normalizeCachedCatalog(state?.cached_catalog)
      const retainedLease = await this.recordFailure(leaseToken, state, error, { retainLease: Boolean(cachedCatalog) })
      if (cachedCatalog && retainedLease) {
        try {
          await this.deliverSecurityEmails(cachedCatalog, leaseToken).catch((deliveryError) => {
            this.log.error('Cached platform security update email processing failed', { error: deliveryError.message })
          })
        } finally {
          await this.releaseLease(leaseToken)
        }
      }
      this.log.warn('Platform update check failed', { code: normalizedErrorCode(error), error: error.message })
      return false
    }
  }

  async acknowledge(user, versions) {
    const state = await this.getState()
    const comparison = comparePlatformVersions(PLATFORM_VERSION, normalizeCachedCatalog(state?.cached_catalog))
    const requested = new Set(versions)
    const releases = comparison.releases.filter((release) => requested.has(release.version))
    if (releases.length !== requested.size) {
      throw Object.assign(new Error('platform_update_release_not_outstanding'), { code: 'platform_update_release_not_outstanding' })
    }
    const nowIso = this.now().toISOString()
    for (const release of releases) {
      await this.db('platform_update_acknowledgements')
        .insert({
          user_id: user.id,
          installed_version: PLATFORM_VERSION,
          release_version: release.version,
          release_revision: release.revision,
          acknowledged_at: nowIso
        })
        .onConflict(['user_id', 'installed_version', 'release_version', 'release_revision'])
        .ignore()
    }
    return this.getStatus(user)
  }

  async setChecksEnabled(user, enabled) {
    const nowIso = this.now().toISOString()
    const changed = await this.db.transaction(async (trx) => {
      const current = await trx('platform_update_state').where('id', PLATFORM_UPDATE_STATE_ID).forUpdate().first()
      if (!current || current.checks_enabled === enabled) return false
      await trx('platform_update_state').where('id', PLATFORM_UPDATE_STATE_ID).update({
        checks_enabled: enabled,
        disabled_at: enabled ? null : nowIso,
        disabled_by: enabled ? null : user.id,
        next_check_at: enabled ? nowIso : null,
        lease_token: null,
        lease_expires_at: null,
        updated_at: nowIso
      })
      await trx('platform_update_audit_events').insert({
        action: enabled ? 'checks_enabled' : 'checks_disabled',
        actor_id: user.id,
        checks_enabled: enabled,
        created_at: nowIso
      })
      return true
    })
    if (changed && enabled) await this.check({ force: true })
    return this.getStatus(user)
  }

  start() {
    if (this.timer || process.env.NODE_ENV === 'test') return
    const run = () => void this.check().catch((error) => {
      this.log.error('Platform update scheduler failed', { error: error.message })
    })
    this.timer = setInterval(run, PLATFORM_UPDATE_SCHEDULER_TICK_MS)
    this.timer.unref?.()
    run()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
