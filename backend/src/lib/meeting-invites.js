import crypto from 'node:crypto'

export function createMeetingInviteToken() {
  return crypto.randomBytes(24).toString('base64url')
}

export function hashMeetingInviteToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token || ''), 'utf8')
    .digest('hex')
}

export function buildMeetingInviteUrl({ frontendUrl, token }) {
  const baseUrl = String(frontendUrl || '').trim().replace(/\/+$/, '')
  return `${baseUrl}/meeting-invite/${encodeURIComponent(token)}`
}
