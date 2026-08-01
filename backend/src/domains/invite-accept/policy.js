import { badRequest, notFound } from '../../lib/errors.js'

export function assertTokenProvided(token) {
  if (!token) {
    throw badRequest('api.invite_accept.token_required', {}, 'Token ist erforderlich')
  }
}

export function assertInviteForLookup(invite) {
  if (!invite) {
    throw notFound('api.invite_accept.invite_not_found', {}, 'Einladung nicht gefunden')
  }
}

export function assertPendingInvite(invite) {
  if (!invite) {
    throw notFound(
      'api.invite_accept.invite_not_found_or_used',
      {},
      'Einladung nicht gefunden oder bereits verwendet'
    )
  }
}

export function isInviteExpired(invite, now = new Date()) {
  if (!invite?.expires_at) return false
  return new Date(invite.expires_at) < now
}

export function assertEmailAvailable(existingUser) {
  if (existingUser) {
    throw badRequest(
      'api.invite_accept.user_with_email_exists',
      {},
      'Ein Nutzer mit dieser E-Mail existiert bereits'
    )
  }
}

export function inviteAcceptanceFailedError() {
  return badRequest(
    'api.invite_accept.completion_failed',
    {},
    'Einladung konnte nicht vollstaendig abgeschlossen werden'
  )
}
