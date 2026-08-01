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

export function getOverdueScheduledMeetingEndedAt(meeting) {
  if (!meeting?.scheduled_end_at) return null

  const scheduledEndAt = new Date(meeting.scheduled_end_at)
  if (Number.isNaN(scheduledEndAt.getTime())) {
    return null
  }

  return scheduledEndAt.toISOString()
}
