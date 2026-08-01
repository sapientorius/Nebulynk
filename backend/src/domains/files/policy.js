import { forbidden, notFound } from '../../lib/errors.js'

export function isExternalNonAdmin({ provider, user }) {
  return Boolean(provider && !user?.is_admin)
}

export function assertOwnUserScope({ provider, user, query }) {
  if (!isExternalNonAdmin({ provider, user })) return
  if (query?.user_id && query.user_id !== user.id) {
    throw forbidden(
      'api.files.access_other_users_files_denied',
      {},
      'Kein Zugriff auf Dateien anderer Nutzer'
    )
  }
}

export function assertFileExists(file) {
  if (!file) {
    throw notFound('api.files.file_not_found', {}, 'Datei nicht gefunden')
  }
}

export function assertMessageExists(message) {
  if (!message) {
    throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
  }
}

export function assertChannelMembership(membership) {
  if (!membership) {
    throw forbidden('api.files.channel_access_denied', {}, 'Kein Zugriff auf diesen Channel')
  }
}

export function requiresMessageReadAccess({ file, currentUserId }) {
  if (file.user_id === currentUserId) return false
  if (!file.message_id) {
    throw forbidden('api.files.file_access_denied', {}, 'Kein Zugriff auf diese Datei')
  }
  return true
}

export function resolveRemovePermission({ file, currentUserId }) {
  if (file.user_id === currentUserId) {
    return { requiresManagePermission: false }
  }

  if (!file.message_id) {
    throw forbidden('api.files.delete_owner_only', {}, 'Nur der Eigentuemer kann diese Datei loeschen')
  }

  return { requiresManagePermission: true }
}

export function normalizeLimit(rawLimit) {
  return Math.min(rawLimit || 50, 100)
}

export function withChannelQuery(currentQuery, channelId) {
  return {
    ...(currentQuery || {}),
    channel_id: channelId
  }
}
