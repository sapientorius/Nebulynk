import { badRequest, forbidden, notFound } from '../../lib/errors.js'

export function isExternalNonAdmin({ provider, user }) {
  return Boolean(provider && !user?.is_admin)
}

export function assertJoinVoicePermission(hasPermission) {
  if (!hasPermission) {
    throw forbidden(
      'api.voice.missing_join_voice_permission',
      { permission: 'join_voice_channels' },
      'Fehlende Berechtigung: join_voice_channels'
    )
  }
}

export function assertChannelExists(channel) {
  if (!channel) {
    throw notFound('api.voice.channel_not_found', {}, 'Channel nicht gefunden')
  }
}

export function assertChannelIsVoice(channel) {
  if (!channel?.is_voice) {
    throw badRequest('api.voice.channel_not_voice', {}, 'Kein Voice-Channel')
  }
}

export function assertChannelIsActive(channel) {
  if (channel?.is_archived) {
    throw badRequest('api.voice.channel_archived', {}, 'Channel ist archiviert')
  }
}

export function assertChannelMembership(membership) {
  if (!membership) {
    throw forbidden('api.voice.channel_access_denied', {}, 'Kein Zugriff auf diesen Channel')
  }
}

export function assertParticipantUpdateResult(updatedRows) {
  if (!updatedRows?.length) {
    throw notFound('api.voice.not_in_voice_channel', {}, 'Nicht im Voice-Channel')
  }
}

export function shouldCleanupRoom(remaining) {
  return Number.parseInt(remaining?.count || 0, 10) === 0
}
