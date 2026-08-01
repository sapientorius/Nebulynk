import crypto from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server'

export const PASSKEY_CHALLENGE_WINDOW_MS = 5 * 60 * 1000

export const defaultPasskeyHelpers = {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
}

export function createWebauthnUserId() {
  return crypto.randomBytes(32)
}

export function encodeBytesForStorage(value) {
  return Buffer.from(value || []).toString('base64url')
}

export function decodeBytesFromStorage(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Uint8Array()
  }

  return new Uint8Array(Buffer.from(value, 'base64url'))
}

export function normalizePasskeyName(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, 120)
}

export function normalizePasskeyTransports(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((entry) => typeof entry === 'string' && entry.trim()))]
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return normalizePasskeyTransports(parsed)
      }
    } catch {
      return []
    }
  }

  return []
}

export function serializePasskeyTransports(value) {
  return JSON.stringify(normalizePasskeyTransports(value))
}

export function buildStoredPasskeyCredential(passkey) {
  return {
    id: passkey.credential_id,
    publicKey: decodeBytesFromStorage(passkey.public_key),
    counter: Number(passkey.counter) || 0,
    transports: normalizePasskeyTransports(passkey.transports)
  }
}
