export function isOverdueScheduledMeeting(meeting, now = new Date()) {
  if (meeting?.status !== 'scheduled' || !meeting?.scheduled_end_at) {
    return false
  }

  const scheduledEndAt = new Date(meeting.scheduled_end_at)
  const nowDate = now instanceof Date ? now : new Date(now)

  if (Number.isNaN(scheduledEndAt.getTime()) || Number.isNaN(nowDate.getTime())) {
    return false
  }

  return scheduledEndAt.getTime() <= nowDate.getTime()
}

export function getEffectiveMeetingStatus(meeting, now = new Date()) {
  if (isOverdueScheduledMeeting(meeting, now)) {
    return 'ended'
  }

  return meeting?.status || null
}
