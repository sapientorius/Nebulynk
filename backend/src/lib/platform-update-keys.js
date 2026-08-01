import { readFileSync } from 'node:fs'

function sanitizeKeyring(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([keyId, publicKey]) => (
    typeof keyId === 'string'
      && keyId.trim()
      && typeof publicKey === 'string'
      && publicKey.includes('BEGIN PUBLIC KEY')
      && publicKey.includes('END PUBLIC KEY')
  )))
}

const embeddedDocument = JSON.parse(readFileSync(
  new URL('../../config/platform-update-public-keys.json', import.meta.url),
  'utf8'
))

export const EMBEDDED_PLATFORM_UPDATE_PUBLIC_KEYS = Object.freeze(sanitizeKeyring(embeddedDocument))

export function resolvePlatformUpdatePublicKeys(env = process.env) {
  const configured = env.NEBULYNK_UPDATE_PUBLIC_KEYS_JSON
  if (!configured) return EMBEDDED_PLATFORM_UPDATE_PUBLIC_KEYS

  try {
    const parsed = JSON.parse(configured)
    return Object.freeze({
      ...EMBEDDED_PLATFORM_UPDATE_PUBLIC_KEYS,
      ...sanitizeKeyring(parsed)
    })
  } catch {
    return EMBEDDED_PLATFORM_UPDATE_PUBLIC_KEYS
  }
}
