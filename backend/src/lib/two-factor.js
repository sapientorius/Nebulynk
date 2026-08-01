import crypto from 'node:crypto'
import QRCode from 'qrcode'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const TWO_FACTOR_ISSUER = 'Nebulynk'
export const TOTP_DIGITS = 6
export const TOTP_PERIOD_SECONDS = 30
export const TOTP_WINDOW = 1
export const TWO_FACTOR_PENDING_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_CHALLENGE_WINDOW_MS = 10 * 60 * 1000
export const LOGIN_CHALLENGE_MAX_ATTEMPTS = 5
export const RECOVERY_CODE_COUNT = 10

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizeBase32(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '')
}

function normalizeTotpCode(value) {
  return String(value || '').replace(/\D/g, '')
}

export function normalizeRecoveryCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function encodeBase32(buffer) {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }

  return output
}

function decodeBase32(value) {
  const normalized = normalizeBase32(value)
  let bits = 0
  let buffer = 0
  const bytes = []

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    buffer = (buffer << 5) | index
    bits += 5

    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

function createHotp(secret, counter) {
  const key = decodeBase32(secret)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (
    ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  )

  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0')
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20))
}

export function formatManualEntryKey(secret) {
  return normalizeBase32(secret).replace(/(.{4})/g, '$1 ').trim()
}

export function buildOtpauthUrl({ email, secret, issuer = TWO_FACTOR_ISSUER }) {
  const normalizedSecret = normalizeBase32(secret)
  const label = `${issuer}:${String(email || '').trim()}`
  const params = new URLSearchParams({
    secret: normalizedSecret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  })

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

export function verifyTotpCode(secret, code, { now = Date.now() } = {}) {
  const normalizedCode = normalizeTotpCode(code)
  if (normalizedCode.length !== TOTP_DIGITS) {
    return false
  }

  const step = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS)
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    if (createHotp(secret, step + offset) === normalizedCode) {
      return true
    }
  }

  return false
}

export function generateTotpCode(secret, { now = Date.now() } = {}) {
  const step = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS)
  return createHotp(secret, step)
}

function createRecoveryCode() {
  const chars = []
  const bytes = crypto.randomBytes(12)
  for (let index = 0; index < 12; index += 1) {
    chars.push(RECOVERY_ALPHABET[bytes[index] % RECOVERY_ALPHABET.length])
  }

  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

export function hashRecoveryCode(code) {
  return crypto
    .createHash('sha256')
    .update(normalizeRecoveryCode(code))
    .digest('hex')
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = []
  while (codes.length < count) {
    const code = createRecoveryCode()
    codes.push({
      code,
      code_hash: hashRecoveryCode(code)
    })
  }
  return codes
}

export function maskUserHint(email) {
  const normalized = String(email || '').trim()
  const atIndex = normalized.indexOf('@')
  if (atIndex <= 1) {
    return normalized ? `${normalized.slice(0, 1)}***` : ''
  }

  const local = normalized.slice(0, atIndex)
  const domain = normalized.slice(atIndex)
  const prefix = local.slice(0, Math.min(2, local.length))
  return `${prefix}${'*'.repeat(Math.max(1, local.length - prefix.length))}${domain}`
}

export async function buildQrSvg({ email, otpauthUrl, issuer = TWO_FACTOR_ISSUER }) {
  const accountLabel = String(email || '').trim() || 'your account'
  const svg = await QRCode.toString(String(otpauthUrl || ''), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: {
      dark: '#111827',
      light: '#ffffff'
    }
  })

  const title = 'Nebulynk two-factor setup QR code'
  const description = `Scan this QR code with your authenticator app to add ${accountLabel} to ${issuer}.`

  return svg.replace(
    /^<svg([^>]*)>/,
    `<svg$1 role="img" aria-labelledby="title desc"><title id="title">${escapeXml(title)}</title><desc id="desc">${escapeXml(description)}</desc>`
  )
}
