import { notFound } from '../../lib/errors.js'

export function isIncludeArchivedRequested(rawValue) {
  return rawValue === true || rawValue === 'true'
}

export function isDiscoverPublicRequested(rawValue) {
  return rawValue === true || rawValue === 'true'
}

export function normalizeIncludeArchived({
  requestedIncludeArchived,
  canManageChannels
}) {
  if (!requestedIncludeArchived) return false
  return !!canManageChannels
}

export function withArchiveMetadata(patchData, userId, nowIso) {
  if (typeof patchData?.is_archived !== 'boolean') return patchData

  if (patchData.is_archived) {
    return {
      ...patchData,
      archived_at: nowIso,
      archived_by: userId
    }
  }

  return {
    ...patchData,
    archived_at: null,
    archived_by: null
  }
}

export function assertChannelExists(channel) {
  if (!channel) {
    throw notFound('api.channels.channel_not_found', {}, 'Channel not found')
  }
}

export function assertMembershipDeleted(deletedCount) {
  if (!deletedCount) {
    throw notFound('api.channels.membership_not_found', {}, 'Not a member of this channel')
  }
}
