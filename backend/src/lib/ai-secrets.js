import crypto from 'node:crypto'
import {
  DEFAULT_AI_SECRET_FALLBACK,
  DEFAULT_AUTHENTICATION_SECRET,
  LEGACY_DEFAULT_AI_SECRET_FALLBACK,
  resolveAiSecretFallback
} from './security-config.js'

function deriveSecretKey(rawSecret) {
  return crypto.createHash('sha256').update(String(rawSecret)).digest()
}

function buildSecretCandidates(app) {
  const primary = resolveAiSecretFallback(
    process.env,
    app?.get?.('authentication')?.secret
  )

  return [...new Set([
    primary,
    app?.get?.('authentication')?.secret,
    process.env.AI_SECRET_KEY,
    DEFAULT_AUTHENTICATION_SECRET,
    DEFAULT_AI_SECRET_FALLBACK,
    LEGACY_DEFAULT_AI_SECRET_FALLBACK
  ]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean))]
}

function getPrimarySecretKey(app) {
  const [rawSecret] = buildSecretCandidates(app)

  if (!rawSecret) {
    throw new Error('AI secret key is not configured')
  }

  return deriveSecretKey(rawSecret)
}

export function encryptSecret(app, secret) {
  const iv = crypto.randomBytes(12)
  const key = getPrimarySecretKey(app)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptSecret(app, encryptedSecret) {
  const [ivB64, tagB64, payloadB64] = String(encryptedSecret || '').split(':')
  if (!ivB64 || !tagB64 || !payloadB64) {
    throw new Error('Invalid encrypted secret format')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const payload = Buffer.from(payloadB64, 'base64')
  let lastError = null

  for (const candidate of buildSecretCandidates(app)) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveSecretKey(candidate),
        iv
      )
      decipher.setAuthTag(authTag)

      const decrypted = Buffer.concat([
        decipher.update(payload),
        decipher.final()
      ])

      return decrypted.toString('utf8')
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Unable to decrypt AI secret')
}
