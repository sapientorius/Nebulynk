function translate(tFn, key, params, fallback) {
  if (typeof tFn === 'function') {
    return tFn(key, params || {})
  }
  return fallback
}

function normalizeText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function countMeetingConnectedParticipants(meeting) {
  const participants = Array.isArray(meeting?.participants) ? meeting.participants : []
  return participants.filter((participant) => (
    participant?.invite_status === 'joined' && !participant?.left_at
  )).length
}

export function countMeetingEngagedParticipants(meeting) {
  if (Number.isInteger(meeting?.engaged_participant_count)) {
    return meeting.engaged_participant_count
  }

  const participants = Array.isArray(meeting?.participants) ? meeting.participants : []
  return participants.filter((participant) => !!participant?.joined_at).length
}

export function resolveMeetingMiniSummary(meeting) {
  const artifacts = Array.isArray(meeting?.artifacts) ? meeting.artifacts : []
  const summaryArtifact = artifacts.find((artifact) => artifact?.artifact_type === 'summary')
  if (summaryArtifact?.status !== 'ready') return null

  const miniSummary = normalizeText(summaryArtifact?.payload?.mini_summary)
  if (miniSummary) return miniSummary

  const markdown = normalizeText(summaryArtifact?.payload?.markdown)
  if (!markdown) return null
  return markdown.split('\n').map((line) => normalizeText(line)).find(Boolean) || null
}

export function resolveMeetingCardStatus(meeting, { tFn } = {}) {
  if (meeting?.status === 'active') {
    return {
      label: translate(tFn, 'ui.components.meeting_card_status_active', {}, 'Active'),
      type: 'success'
    }
  }

  if (meeting?.status === 'scheduled') {
    return {
      label: translate(tFn, 'ui.views.scheduled', {}, 'Scheduled'),
      type: 'info'
    }
  }

  if (meeting?.status === 'ended') {
    return {
      label: translate(tFn, 'ui.components.meeting_card_status_ended', {}, 'Ended'),
      type: 'warning'
    }
  }

  if (meeting?.status === 'cancelled') {
    return {
      label: translate(tFn, 'ui.views.cancelled', {}, 'Cancelled'),
      type: 'error'
    }
  }

  return {
    label: translate(tFn, 'ui.components.meeting_card_status_loading', {}, 'Loading...'),
    type: 'default'
  }
}

export function buildMeetingCardState({
  meetingId,
  meeting,
  connectedCount = null,
  voiceChannelId = null,
  isJoining = false,
  title = null,
  subtitle = null,
  tFn
} = {}) {
  const chatChannelId = meeting?.chat_channel_id || null
  const isAccessDenied = meeting?.content_access?.allowed === false
  const isJoinVisible = !isAccessDenied && (meeting?.status === 'active' || meeting?.status === 'scheduled')
  const status = resolveMeetingCardStatus(meeting, { tFn })
  const fallbackConnectedCount = countMeetingConnectedParticipants(meeting)
  const resolvedConnectedCount = Number.isInteger(connectedCount) ? connectedCount : fallbackConnectedCount
  const engagedCount = countMeetingEngagedParticipants(meeting)
  const isEnded = meeting?.status === 'ended'
  const isScheduled = meeting?.status === 'scheduled'
  const summaryText = isAccessDenied
    ? translate(
        tFn,
        'meetingHistoryAccess.denied',
        {},
        'You do not have permission to view this meeting content under the channel settings.'
      )
    : isEnded
    ? translate(tFn, 'ui.components.meeting_card_engaged_count', { count: engagedCount }, `${engagedCount} engaged`)
    : isScheduled
      ? translate(tFn, 'ui.views.starts_at', {}, 'Starts')
    : translate(tFn, 'ui.components.meeting_card_live_count', { count: resolvedConnectedCount }, `${resolvedConnectedCount} in call`)
  const miniSummary = isEnded && !isAccessDenied ? resolveMeetingMiniSummary(meeting) : null

  return {
    meetingId: normalizeText(meetingId),
    meeting: meeting || null,
    title: normalizeText(title),
    subtitle: normalizeText(subtitle),
    statusLabel: status.label,
    statusType: status.type,
    summaryText,
    miniSummary,
    isAccessDenied,
    isJoinVisible,
    isJoining: !!isJoining,
    isJoinDisabled: !isJoinVisible || !chatChannelId || voiceChannelId === chatChannelId || !!isJoining || meeting?.status === 'cancelled'
  }
}
