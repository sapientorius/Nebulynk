import { badRequest, forbidden, notFound } from '../../lib/errors.js'

export function isExternalNonAdmin({ provider, user }) {
  return Boolean(provider && !user?.is_admin)
}

export function assertFindFilters(query) {
  const hasUserFilter = Boolean(query?.user_id)
  const hasMessageFilter = Boolean(query?.message_id)

  if (!hasUserFilter && !hasMessageFilter) {
    throw badRequest(
      'api.mentions.user_or_message_required',
      {},
      'user_id oder message_id ist erforderlich'
    )
  }
}

export function assertOwnMentionsFilter({ user, query }) {
  if (!user?.is_admin && query?.user_id && query.user_id !== user.id) {
    throw forbidden('api.mentions.only_own_mentions_allowed', {}, 'Nur eigene Mentions sind erlaubt')
  }
}

export function assertMessageExists(message) {
  if (!message) {
    throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
  }
}

export function assertChannelMembership(membership) {
  if (!membership) {
    throw forbidden('api.mentions.channel_access_denied', {}, 'Kein Zugriff auf diesen Channel')
  }
}

export function normalizeLimit(rawLimit) {
  return Math.min(rawLimit || 50, 100)
}

export function withSelfScope(query, userId) {
  return {
    ...(query || {}),
    user_id: userId
  }
}
