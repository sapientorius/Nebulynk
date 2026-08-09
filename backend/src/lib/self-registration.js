import crypto from 'node:crypto'
import { domainToASCII } from 'node:url'
import { createId } from '@paralleldrive/cuid2'
import { resolveFrontendUrl } from './security-config.js'

export const REGISTRATION_TOKEN_WINDOW_MS = 24 * 60 * 60 * 1000

export const REGISTRATION_STATUS = Object.freeze({
  active: 'active',
  pendingEmailVerification: 'pending_email_verification',
  pendingAdminApproval: 'pending_admin_approval'
})

export const SELF_REGISTRATION_SETTING_KEYS = Object.freeze({
  enabled: 'self_registration_enabled',
  allowedDomains: 'self_registration_allowed_domains',
  requiresAdminApproval: 'self_registration_requires_admin_approval'
})

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeString(value).toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return fallback
}

export function normalizeEmail(value) {
  return normalizeString(value).toLowerCase()
}

export function normalizeAllowedDomain(value) {
  const candidate = normalizeString(value)
    .toLowerCase()
    .replace(/\.+$/, '')

  if (!candidate || candidate.includes('@') || candidate.includes('*') || candidate.includes('/') || candidate.includes(':')) {
    return null
  }

  const ascii = domainToASCII(candidate)
  if (!ascii || ascii.length > 253 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(ascii)) {
    return null
  }

  return ascii.toLowerCase()
}

export function normalizeAllowedDomains(value) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,;]+/)
      : []

  return [...new Set(candidates
    .map(normalizeAllowedDomain)
    .filter(Boolean))]
    .sort()
}

export function parseStoredAllowedDomains(value) {
  const raw = normalizeString(value)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return normalizeAllowedDomains(parsed)
  } catch {
    // Supports older, manually entered comma-separated values as a safe fallback.
  }

  return normalizeAllowedDomains(raw)
}

export function getEmailDomain(email) {
  const normalized = normalizeEmail(email)
  const atIndex = normalized.lastIndexOf('@')
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null
  return normalizeAllowedDomain(normalized.slice(atIndex + 1))
}

export function isEmailDomainAllowed(email, allowedDomains = []) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return true
  const emailDomain = getEmailDomain(email)
  return !!emailDomain && allowedDomains.includes(emailDomain)
}

export function isRegistrationStatusActive(status) {
  return !status || status === REGISTRATION_STATUS.active
}

export function isRegistrationStatusPending(status) {
  return status === REGISTRATION_STATUS.pendingEmailVerification
    || status === REGISTRATION_STATUS.pendingAdminApproval
}

export function createRegistrationToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function hashRegistrationToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex')
}

export function buildRegistrationConfirmationUrl({ frontendUrl, token }) {
  const baseUrl = String(frontendUrl || '').trim().replace(/\/+$/, '')
  return `${baseUrl}/register/confirm/${encodeURIComponent(token)}`
}

export function resolveRegistrationConfirmationUrl(token) {
  return buildRegistrationConfirmationUrl({
    frontendUrl: resolveFrontendUrl(process.env),
    token
  })
}

export async function getPlatformSettingsMap(db, keys) {
  const rows = await db('platform_settings').whereIn('key', keys).select('key', 'value')
  return rows.reduce((result, row) => ({ ...result, [row.key]: row.value }), {})
}

export async function getSelfRegistrationSettings(db) {
  const values = await getPlatformSettingsMap(db, Object.values(SELF_REGISTRATION_SETTING_KEYS))
  return {
    enabled: parseBoolean(values[SELF_REGISTRATION_SETTING_KEYS.enabled], false),
    allowedDomains: parseStoredAllowedDomains(values[SELF_REGISTRATION_SETTING_KEYS.allowedDomains]),
    requiresAdminApproval: parseBoolean(values[SELF_REGISTRATION_SETTING_KEYS.requiresAdminApproval], false)
  }
}

export async function setPlatformSetting(db, key, value) {
  const updated = await db('platform_settings').where('key', key).update({ value })
  if (!updated) {
    await db('platform_settings').insert({ key, value })
  }
}

export async function getPlatformDefaultLocale(db) {
  const row = await db('platform_settings').where('key', 'default_locale').first()
  return row?.value || 'en'
}

export async function isPlatformInitialized(db) {
  const row = await db('platform_settings').where('key', 'initialized').first()
  return row?.value === 'true'
}

export async function assignDefaultMemberRole(db, userId) {
  const role = await db('roles').where('name', 'platform:member').first()
  if (!role) {
    throw new Error('The platform:member role is required for self-registration')
  }

  const existing = await db('user_roles').where({ user_id: userId, role_id: role.id }).first()
  if (existing) return

  await db('user_roles').insert({
    id: createId(),
    user_id: userId,
    role_id: role.id
  })
}
