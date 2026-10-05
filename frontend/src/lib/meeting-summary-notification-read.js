import { watch } from 'vue'
import { shouldRetryNotificationAutoRead } from './notification-auto-read.js'

// Only observe an actually mounted summary panel, never a merely loaded meeting.
export function observeMeetingSummaryNotifications({ getMeetingId, isReady, notificationsStore, doc = document }) {
  let stopped = false
  let inFlight = false
  let needsRead = false
  let retryTimer = null
  let generation = 0

  function visible() {
    return !stopped && doc.visibilityState === 'visible' && isReady() && !!getMeetingId()
  }

  async function read() {
    if (!visible() || inFlight || !needsRead) return
    const meetingId = getMeetingId()
    const currentGeneration = generation
    needsRead = false
    inFlight = true
    try {
      await notificationsStore.markMeetingSummaryReadyRead(meetingId)
    } catch (error) {
      if (currentGeneration === generation && shouldRetryNotificationAutoRead(error)) {
        needsRead = true
        retryTimer = setTimeout(() => { retryTimer = null; void read() }, 1000)
      }
    } finally {
      inFlight = false
      // Notifications may arrive while the previous scoped patch is in flight.
      if (needsRead && !retryTimer) void read()
    }
  }

  function requestRead() {
    needsRead = true
    void read()
  }

  const stopVisibilityWatch = watch([getMeetingId, isReady], () => {
    generation++
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    requestRead()
  }, { immediate: true, flush: 'post' })
  const stopNotificationWatch = watch(() => notificationsStore.notifications
    .filter(notification => notification.type === 'meeting_summary_ready'
      && notification.meeting_id === getMeetingId() && !notification.is_read)
    .map(notification => notification.id).join(','), (ids) => {
    if (ids) requestRead()
  }, { flush: 'post' })
  doc.addEventListener('visibilitychange', requestRead)

  return () => {
    stopped = true
    generation++
    stopVisibilityWatch()
    stopNotificationWatch()
    doc.removeEventListener('visibilitychange', requestRead)
    if (retryTimer) clearTimeout(retryTimer)
  }
}
