import { NotAuthenticated } from '@feathersjs/errors'

export function getUserAuthVersion(user) {
  const parsed = Number.parseInt(user?.auth_version, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function buildAuthTokenPayload(user) {
  return { auth_version: getUserAuthVersion(user) }
}

export function assertAccessTokenVersion(payload, user) {
  const currentVersion = getUserAuthVersion(user)
  const tokenVersion = Number.parseInt(payload?.auth_version, 10)

  // Tokens issued before this field was introduced remain valid until the
  // account is disabled for the first time (which increments auth_version).
  if (!Number.isInteger(tokenVersion) && currentVersion === 1) return

  if (tokenVersion !== currentVersion) {
    throw new NotAuthenticated('Access token has been revoked')
  }
}
