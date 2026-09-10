import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMeetingCallsStore } from '../../src/stores/meeting-calls.js'

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  session: { user: { id: 'caller' } },
  meetings: { join: vi.fn(), activeMeetingId: null },
  push: vi.fn(), sound: vi.fn()
}))
vi.mock('../../src/lib/api.js', () => ({ default: mocks.api }))
vi.mock('../../src/router/index.js', () => ({ default: { push: mocks.push } }))
vi.mock('../../src/stores/session.js', () => ({ useSessionStore: () => mocks.session }))
vi.mock('../../src/stores/meetings.js', () => ({ useMeetingsStore: () => mocks.meetings }))
vi.mock('../../src/lib/sfx.js', () => ({ playSfx: mocks.sound, SFX_EVENTS: { CALL_INCOMING: 'incoming', CALL_OUTGOING: 'outgoing' } }))

let store
const call = (overrides = {}) => ({ id: 'call', caller_id: 'caller', source_channel_id: 'source',
  status: 'ringing', recipient_status: 'invited', expires_at: new Date(Date.now() + 30_000).toISOString(), ...overrides })

describe('meeting call signaling', () => {
  it('rings immediately and every four seconds, without restarting on duplicate loads', async () => {
    mocks.session.user.id = 'alice'
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.load('call')
    expect(mocks.sound).toHaveBeenCalledExactlyOnceWith('incoming')
    await store.load('call')
    await vi.advanceTimersByTimeAsync(3999)
    expect(mocks.sound).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.sound).toHaveBeenCalledTimes(2)
    store.reset()
    await vi.advanceTimersByTimeAsync(8000)
    expect(mocks.sound).toHaveBeenCalledTimes(2)
  })

  it.each([
    { status: 'cancelled' }, { status: 'expired' }, { status: 'declined', recipient_status: 'declined' },
    { status: 'accepted', recipient_status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }
  ])('stops ringing on resolved invitation %j', async resolved => {
    mocks.session.user.id = 'alice'
    mocks.api.get.mockResolvedValueOnce({ data: call() }).mockResolvedValueOnce({ data: call(resolved) })
    await store.load('call')
    await store.load('call')
    await vi.advanceTimersByTimeAsync(8000)
    expect(mocks.sound).toHaveBeenCalledExactlyOnceWith('incoming')
    expect(store.incoming).toHaveLength(0)
  })

  it('shares one pending action across surfaces and releases it after failure', async () => {
    let reject
    mocks.api.patch.mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    mocks.api.get.mockResolvedValue({ data: call() })
    const accepting = store.act('call', 'accept')
    expect(store.busy.call).toBe('accept')
    await store.act('call', 'decline')
    expect(mocks.api.patch).toHaveBeenCalledTimes(1)
    reject(new Error('offline'))
    await expect(accepting).rejects.toThrow('offline')
    expect(store.busy.call).toBeUndefined()
    expect(mocks.api.get).toHaveBeenCalledWith('/meeting-calls/call')
  })
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    setActivePinia(createPinia())
    mocks.session.user.id = 'caller'
    mocks.meetings.activeMeetingId = null
    mocks.meetings.join.mockResolvedValue({})
    mocks.push.mockResolvedValue(undefined)
    store = useMeetingCallsStore()
  })
  afterEach(() => { store.$dispose(); vi.useRealTimers() })

  it('stays in the chat with no media join while ringing', async () => {
    const data = call({ created_new: true })
    mocks.api.post.mockResolvedValue({ data })
    mocks.api.get.mockResolvedValue({ data })
    await store.start('source')
    expect(store.outgoing).toHaveLength(1)
    expect(mocks.meetings.join).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('automatically joins the originating store once after acceptance', async () => {
    mocks.api.post.mockResolvedValue({ data: call({ created_new: true }) })
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.start('source')
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }) })
    await store.load('call')
    await store.load('call')
    expect(mocks.meetings.join).toHaveBeenCalledExactlyOnceWith('meeting')
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/meetings/meeting')
  })

  it('recovers a missed acceptance event and stops polling after joining the caller once', async () => {
    mocks.api.post.mockResolvedValue({ data: call({ created_new: true }) })
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.start('source')
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.outgoing).toHaveLength(0)
    expect(mocks.meetings.join).toHaveBeenCalledExactlyOnceWith('meeting')
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/meetings/meeting')
    const reads = mocks.api.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocks.api.get).toHaveBeenCalledTimes(reads)
    expect(mocks.meetings.join).toHaveBeenCalledTimes(1)
  })

  it('does not automatically join a recovered ringing attempt on another device', async () => {
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.load('call')
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.outgoing).toHaveLength(0)
    expect(store.available).toHaveLength(1)
    expect(mocks.meetings.join).not.toHaveBeenCalled()
  })

  it('retries transient failures past the countdown without overlapping recovery requests', async () => {
    mocks.api.post.mockResolvedValue({ data: call({ created_new: true }) })
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.start('source')
    let resolve
    mocks.api.get.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await vi.advanceTimersByTimeAsync(32000)
    expect(mocks.api.get).toHaveBeenCalledTimes(2)
    resolve({ data: call() })
    await vi.advanceTimersByTimeAsync(0)
    mocks.api.get.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(2000)
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.meetings.join).toHaveBeenCalledExactlyOnceWith('meeting')
  })

  it('ignores an in-flight recovery after logout', async () => {
    mocks.api.post.mockResolvedValue({ data: call({ created_new: true }) })
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.start('source')
    let resolve
    mocks.api.get.mockReturnValueOnce(new Promise(done => { resolve = done }))
    await vi.advanceTimersByTimeAsync(2000)
    store.reset()
    resolve({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' }) })
    await vi.advanceTimersByTimeAsync(6000)
    expect(mocks.meetings.join).not.toHaveBeenCalled()
    expect(store.calls).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not auto-join a meeting that ended before acceptance was recovered', async () => {
    mocks.api.post.mockResolvedValue({ data: call({ created_new: true }) })
    mocks.api.get.mockResolvedValue({ data: call() })
    await store.start('source')
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'ended' }) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.outgoing).toHaveLength(0)
    expect(mocks.meetings.join).not.toHaveBeenCalled()
  })

  it('restoring a call in another tab never enables the microphone automatically', async () => {
    const data = call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' })
    mocks.api.get.mockImplementation(path => Promise.resolve({ data: path === '/meeting-calls' ? [data] : data }))
    await store.refresh()
    expect(store.available).toHaveLength(1)
    expect(mocks.meetings.join).not.toHaveBeenCalled()
    await store.enter(data)
    expect(mocks.meetings.join).toHaveBeenCalledOnce()
  })

  it('only the winning recipient device automatically joins', async () => {
    mocks.session.user.id = 'alice'
    mocks.api.patch.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', recipient_status: 'accepted', accepted_now: false }) })
    await store.act('call', 'accept')
    expect(mocks.meetings.join).not.toHaveBeenCalled()
    mocks.api.patch.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', recipient_status: 'accepted', accepted_now: true }) })
    await Promise.all([store.act('call', 'accept'), store.act('call', 'accept')])
    expect(mocks.meetings.join).toHaveBeenCalledOnce()
  })

  it('group ringing ends at the original deadline without a client decline request', async () => {
    mocks.session.user.id = 'bob'
    const initial = call()
    mocks.api.get.mockResolvedValue({ data: initial })
    await store.load('call')
    await vi.advanceTimersByTimeAsync(10_000)
    mocks.api.get.mockResolvedValue({ data: { ...initial, status: 'accepted', meeting_id: 'meeting', meeting_status: 'active' } })
    await store.load('call')
    expect(store.incoming).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(store.incoming).toHaveLength(0)
    expect(mocks.api.patch).not.toHaveBeenCalled()
  })

  it('does not resurrect ringing after logout while start is pending', async () => {
    let resolve
    mocks.api.post.mockReturnValue(new Promise(done => { resolve = done }))
    const starting = store.start('source')
    store.reset()
    resolve({ data: call({ created_new: true }) })
    await starting
    expect(store.calls).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not overwrite a newer event with an older pending response', async () => {
    let resolve
    mocks.api.get.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const older = store.load('call')
    mocks.api.get.mockResolvedValueOnce({ data: call({ status: 'cancelled' }) })
    await store.load('call')
    resolve({ data: call() })
    await older
    expect(store.outgoing).toHaveLength(0)
  })

  it('does not overwrite cancellation with a pending older GET', async () => {
    let resolve
    mocks.api.get.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const older = store.load('call')
    mocks.api.patch.mockResolvedValue({ data: call({ status: 'cancelled' }) })
    await store.act('call', 'cancel')
    resolve({ data: call() })
    await older
    expect(store.calls[0].status).toBe('cancelled')
    expect(store.outgoing).toHaveLength(0)
  })

  it('preserves a newly arrived call when an older list request completes', async () => {
    let resolve
    mocks.api.get.mockReturnValueOnce(new Promise(done => { resolve = done }))
    const refreshing = store.refresh()
    mocks.api.get.mockResolvedValueOnce({ data: call() })
    await store.load('call')
    resolve({ data: [] })
    await refreshing
    expect(store.outgoing).toHaveLength(1)
  })

  it('never rings a group invitation whose meeting has already ended', async () => {
    mocks.session.user.id = 'bob'
    mocks.api.get.mockResolvedValue({ data: call({ status: 'accepted', meeting_id: 'meeting', meeting_status: 'ended' }) })
    await store.load('call')
    expect(store.incoming).toEqual([])
  })
})
