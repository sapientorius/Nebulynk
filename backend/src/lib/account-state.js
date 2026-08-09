import crypto from 'node:crypto'
import { forbidden } from './errors.js'
import { isRegistrationStatusActive } from './self-registration.js'

export function isGuestAccount(user) {
  return user?.account_type === 'guest'
}

export function isUserDisabled(user, now = new Date()) {
  if (!user || typeof user !== 'object') return true
  if (!isRegistrationStatusActive(user.registration_status)) return true
  if (user.disabled_at) return true

  if (!isGuestAccount(user) || !user.guest_expires_at) {
    return false
  }

  const expiresAt = new Date(user.guest_expires_at)
  if (Number.isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() <= now.getTime()
}

export function assertUserAccountActive(user, now = new Date()) {
  if (user && !isRegistrationStatusActive(user.registration_status)) {
    throw forbidden(
      'api.authentication.account_pending',
      { registration_status: user.registration_status },
      'Dieses Konto ist noch nicht aktiv'
    )
  }

  if (!isUserDisabled(user, now)) return

  throw forbidden(
    'api.authentication.account_disabled',
    {},
    'Dieses Konto ist nicht mehr aktiv'
  )
}

export function buildGuestUserEmail(userId) {
  return `guest+${String(userId || '').trim()}@guest.nebulynk.local`
}

export function createGuestPassword() {
  return crypto.randomBytes(24).toString('hex')
}
