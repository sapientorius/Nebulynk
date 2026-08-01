import crypto from 'node:crypto'

export const PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000

export function createPasswordResetToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function hashPasswordResetToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex')
}

export function buildPasswordResetUrl({ frontendUrl, token }) {
  const baseUrl = String(frontendUrl || '').trim().replace(/\/+$/, '')
  return `${baseUrl}/reset-password/${encodeURIComponent(token)}`
}
