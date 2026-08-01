const LEGACY_MEETING_INVITE_PATTERN = /^Meeting invite:\s+\/meetings\/([a-z0-9-]+)$/i

function normalizeText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseLegacyMeetingInviteSnippet(snippet) {
  if (typeof snippet !== 'string') return null
  const match = snippet.trim().match(LEGACY_MEETING_INVITE_PATTERN)
  return match ? match[1] : null
}

export function resolveNotificationMeetingId(notification) {
  const explicitMeetingId = normalizeText(notification?.meeting_id)
  if (explicitMeetingId) return explicitMeetingId

  if (notification?.type !== 'meeting_invite') return null
  return parseLegacyMeetingInviteSnippet(notification?.message_snippet)
}
