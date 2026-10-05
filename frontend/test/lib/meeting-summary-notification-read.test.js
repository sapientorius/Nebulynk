import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { observeMeetingSummaryNotifications } from '../../src/lib/meeting-summary-notification-read.js'

let cleanup
afterEach(() => { cleanup?.(); vi.useRealTimers() })
async function flush() { for (let index = 0; index < 4; index++) { await nextTick(); await Promise.resolve() } }
function setup({ ready = true, visibility = 'visible', patch } = {}) {
  const state = reactive({ meetingId: 'meeting', ready })
  const store = reactive({ notifications: [], markMeetingSummaryReadyRead: vi.fn(patch || (async () => 0)) })
  const doc = new EventTarget()
  doc.visibilityState = visibility
  cleanup = observeMeetingSummaryNotifications({
    getMeetingId: () => state.meetingId, isReady: () => state.ready, notificationsStore: store, doc
  })
  return { state, store, doc }
}

describe('viewed meeting summary notifications', () => {
  it('marks server-side notifications read on direct opening before the notification list loads', async () => {
    const { store } = setup()
    await flush()
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledExactlyOnceWith('meeting')
  })

  it('waits for a ready, visible summary and reacts to visibility changes', async () => {
    const { state, store, doc } = setup({ ready: false, visibility: 'hidden' })
    state.ready = true
    await flush()
    expect(store.markMeetingSummaryReadyRead).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledExactlyOnceWith('meeting')
  })

  it('handles arrivals during a pending patch while ignoring invitations and other meetings', async () => {
    let resolve
    const pending = new Promise(yes => { resolve = yes })
    const { store } = setup({ patch: vi.fn().mockReturnValueOnce(pending).mockResolvedValue(1) })
    store.notifications.push({ id: 'invite', meeting_id: 'meeting', type: 'meeting_invite', is_read: false })
    store.notifications.push({ id: 'other', meeting_id: 'other', type: 'meeting_summary_ready', is_read: false })
    await flush()
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledTimes(1)
    store.notifications.push({ id: 'summary', meeting_id: 'meeting', type: 'meeting_summary_ready', is_read: false })
    await flush()
    resolve(0)
    await flush()
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledTimes(2)
    expect(store.markMeetingSummaryReadyRead).toHaveBeenLastCalledWith('meeting')
  })

  it('stops observing on unmount and never reads hidden summaries', async () => {
    const { store, doc } = setup({ visibility: 'hidden' })
    cleanup()
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    store.notifications.push({ id: 'summary', meeting_id: 'meeting', type: 'meeting_summary_ready' })
    await flush()
    expect(store.markMeetingSummaryReadyRead).not.toHaveBeenCalled()
  })

  it('retries transient failures and cancels retries when the panel disappears', async () => {
    vi.useFakeTimers()
    const { store } = setup({ patch: vi.fn().mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValue(1) })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledTimes(2)
    store.markMeetingSummaryReadyRead.mockRejectedValue({ response: { status: 503 } })
    store.notifications.push({ id: 'summary', meeting_id: 'meeting', type: 'meeting_summary_ready' })
    await flush()
    cleanup()
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledTimes(3)
  })

  it('does not retry permission errors', async () => {
    vi.useFakeTimers()
    const { store } = setup({ patch: async () => { throw { response: { status: 403 } } } })
    await flush()
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.markMeetingSummaryReadyRead).toHaveBeenCalledTimes(1)
  })

  it('scopes a follow-up patch to a new meeting when an old request is still pending', async () => {
    let resolve
    const { state, store } = setup({ patch: vi.fn().mockReturnValueOnce(new Promise(yes => { resolve = yes })).mockResolvedValue(0) })
    state.meetingId = 'new-meeting'
    await flush()
    resolve(0)
    await flush()
    expect(store.markMeetingSummaryReadyRead.mock.calls.map(call => call[0])).toEqual(['meeting', 'new-meeting'])
  })
})
