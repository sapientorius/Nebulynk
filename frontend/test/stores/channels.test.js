import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChannelsStore } from '../../src/stores/channels.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const sessionStoreMock = vi.hoisted(() => ({
  user: { id: 'user-self' },
  permissions: [],
  hasPermission: vi.fn(() => false),
  refreshPermissions: vi.fn()
}))

const dmsStoreMock = vi.hoisted(() => ({
  dmChannels: []
}))

const messagesStoreMock = vi.hoisted(() => ({
  messages: [],
  resetChannelMessages: vi.fn(),
  loadLatest: vi.fn().mockResolvedValue(undefined),
  loadMore: vi.fn().mockResolvedValue(undefined),
  loadPins: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

vi.mock('../../src/stores/session.js', () => ({
  useSessionStore: () => sessionStoreMock
}))

vi.mock('../../src/stores/dms.js', () => ({
  useDmsStore: () => dmsStoreMock
}))

vi.mock('../../src/stores/messages.js', () => ({
  useMessagesStore: () => messagesStoreMock
}))

describe('channels store membership flows', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.patch.mockReset()
    apiMock.delete.mockReset()
    messagesStoreMock.resetChannelMessages.mockReset()
    messagesStoreMock.loadLatest.mockClear()
    messagesStoreMock.loadMore.mockClear()
    messagesStoreMock.loadPins.mockClear()
    messagesStoreMock.messages = []
    dmsStoreMock.dmChannels = []
    sessionStoreMock.user = { id: 'user-self' }
    sessionStoreMock.hasPermission.mockReset()
    sessionStoreMock.hasPermission.mockReturnValue(false)

    const store = useChannelsStore()
    store.reset()
  })

  async function flushAsyncWork() {
    await Promise.resolve()
    await Promise.resolve()
  }

  it('discoverPublic loads discover_public channels and filters by search term', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'public-1', name: 'General', description: 'Ops' },
          { id: 'public-2', name: 'Support', description: 'Help desk' }
        ]
      }
    })

    const store = useChannelsStore()
    const result = await store.discoverPublic('gen')

    expect(apiMock.get).toHaveBeenCalledWith('/channels', {
      params: { $limit: 100, discover_public: true }
    })
    expect(result).toEqual([{ id: 'public-1', name: 'General', description: 'Ops' }])
  })

  it('refresh loads standard channels without archived payloads and caches the result for 30 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false }
        ]
      }
    })

    const store = useChannelsStore()

    await expect(store.refresh()).resolves.toEqual([
      { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false }
    ])
    await expect(store.refresh()).resolves.toEqual([
      { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false }
    ])

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/channels', {
      params: { $limit: 100 }
    })

    vi.useRealTimers()
  })

  it('refresh starts a background reload when the cached standard channels are stale', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'))
    apiMock.get
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false },
            { id: 'channel-2', name: 'Ops', type: 'private', purpose: 'default', is_archived: false }
          ]
        }
      })

    const store = useChannelsStore()
    await store.refresh()

    vi.setSystemTime(new Date('2026-06-23T12:00:31.000Z'))
    const staleResult = await store.refresh()

    expect(staleResult).toEqual([
      { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false }
    ])
    expect(apiMock.get).toHaveBeenCalledTimes(2)

    await flushAsyncWork()
    expect(store.channels).toEqual([
      { id: 'channel-1', name: 'General', type: 'public', purpose: 'default', is_archived: false },
      { id: 'channel-2', name: 'Ops', type: 'private', purpose: 'default', is_archived: false }
    ])

    vi.useRealTimers()
  })

  it('refreshArchived loads archived channels through the dedicated endpoint params', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'channel-archived-1', name: 'Archive', type: 'public', purpose: 'default', is_archived: true },
          { id: 'channel-live-1', name: 'Live', type: 'public', purpose: 'default', is_archived: false }
        ]
      }
    })

    const store = useChannelsStore()
    const result = await store.refreshArchived()

    expect(apiMock.get).toHaveBeenCalledWith('/channels', {
      params: { $limit: 100, include_archived: true }
    })
    expect(result).toEqual([
      { id: 'channel-archived-1', name: 'Archive', type: 'public', purpose: 'default', is_archived: true }
    ])
    expect(store.archivedChannels).toEqual([
      { id: 'channel-archived-1', name: 'Archive', type: 'public', purpose: 'default', is_archived: true }
    ])
  })

  it('create sends initial_user_ids when provided', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        id: 'channel-1',
        name: 'ops',
        type: 'private'
      }
    })

    const store = useChannelsStore()
    await store.create('ops', 'private', 'desc', false, ['u-1', 'u-2'])

    expect(apiMock.post).toHaveBeenCalledWith('/channels', {
      name: 'ops',
      type: 'private',
      description: 'desc',
      initial_user_ids: ['u-1', 'u-2']
    })
  })

  it('joinPublic creates membership and refreshes joined channels', async () => {
    apiMock.post.mockResolvedValueOnce({ data: { id: 'membership-1' } })
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'channel-joined', name: 'Joined channel' }]
      }
    })

    const store = useChannelsStore()
    const joined = await store.joinPublic('channel-joined')

    expect(apiMock.post).toHaveBeenCalledWith('/channel-members', {
      channel_id: 'channel-joined',
      user_id: 'user-self'
    })
    expect(joined?.id).toBe('channel-joined')
    expect(store.channels).toHaveLength(1)
  })

  it('refreshChannel upserts a single fetched standard channel', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'channel-single-1',
        name: 'Operations',
        type: 'private'
      }
    })

    const store = useChannelsStore()
    const channel = await store.refreshChannel('channel-single-1')

    expect(apiMock.get).toHaveBeenCalledWith('/channels/channel-single-1')
    expect(channel?.id).toBe('channel-single-1')
    expect(store.channels).toEqual([{
      id: 'channel-single-1',
      name: 'Operations',
      type: 'private'
    }])
  })

  it('refreshChannel removes local channel on 403 or 404', async () => {
    apiMock.get.mockRejectedValueOnce({
      response: { status: 404 }
    })

    const store = useChannelsStore()
    store.channels = [{ id: 'channel-gone-1', name: 'Hidden channel' }]

    const channel = await store.refreshChannel('channel-gone-1')

    expect(channel).toBe(null)
    expect(store.channels).toEqual([])
  })

  it('update moves channels between the active and archived lists when archive state changes', async () => {
    apiMock.patch
      .mockResolvedValueOnce({
        data: {
          id: 'channel-1',
          name: 'Ops',
          type: 'private',
          purpose: 'default',
          is_archived: true
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'channel-1',
          name: 'Ops',
          type: 'private',
          purpose: 'default',
          is_archived: false
        }
      })

    const store = useChannelsStore()
    store.channels = [{
      id: 'channel-1',
      name: 'Ops',
      type: 'private',
      purpose: 'default',
      is_archived: false
    }]

    await store.update('channel-1', { is_archived: true })

    expect(store.channels).toEqual([])
    expect(store.archivedChannels).toEqual([{
      id: 'channel-1',
      name: 'Ops',
      type: 'private',
      purpose: 'default',
      is_archived: true
    }])

    await store.update('channel-1', { is_archived: false })

    expect(store.channels).toEqual([{
      id: 'channel-1',
      name: 'Ops',
      type: 'private',
      purpose: 'default',
      is_archived: false
    }])
    expect(store.archivedChannels).toEqual([])
  })

  it('leaveChannel deletes own membership and clears active context for active channel', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'membership-1', channel_id: 'channel-1', user_id: 'user-self' }]
      }
    })
    apiMock.delete.mockResolvedValueOnce({ data: {} })

    const store = useChannelsStore()
    store.channels = [{ id: 'channel-1', name: 'Ops' }]
    store.activeChannelId = 'channel-1'

    const left = await store.leaveChannel('channel-1')

    expect(left).toBe(true)
    expect(apiMock.delete).toHaveBeenCalledWith('/channel-members/membership-1')
    expect(store.channels).toEqual([])
    expect(store.activeChannelId).toBe(null)
  })

  it('batches queued read watermarks into one backend patch', async () => {
    vi.useFakeTimers()
    apiMock.patch.mockResolvedValue({ data: { updated: true } })

    const store = useChannelsStore()
    await store.queueReadWatermark('channel-1', '2026-03-15T09:00:00.000Z')
    await store.queueReadWatermark('channel-1', '2026-03-15T09:01:00.000Z')

    expect(apiMock.patch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    await flushAsyncWork()

    expect(apiMock.patch).toHaveBeenCalledTimes(1)
    expect(apiMock.patch).toHaveBeenCalledWith('/channel-read-state', {
      channel_id: 'channel-1',
      last_read_at: '2026-03-15T09:01:00.000Z'
    })

    vi.useRealTimers()
  })

  it('flushes the previous channel watermark when switching channels', async () => {
    apiMock.patch.mockResolvedValue({ data: { updated: true } })
    apiMock.get
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { permissions: [] } })
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({ data: { permissions: [] } })

    const store = useChannelsStore()
    store.activeChannelId = 'channel-1'
    store.myMembership = { id: 'membership-1', channel_id: 'channel-1', user_id: 'user-self' }
    await store.queueReadWatermark('channel-1', '2026-03-15T09:00:00.000Z')
    await store.select('channel-2')

    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/channel-read-state', {
      channel_id: 'channel-1',
      last_read_at: '2026-03-15T09:00:00.000Z'
    })
  })

  it('marks empty meeting channels as read immediately when selected', async () => {
    apiMock.patch.mockResolvedValue({ data: { updated: true } })
    apiMock.get
      .mockResolvedValueOnce({ data: { data: [{ id: 'membership-1', user_id: 'user-self' }] } })
      .mockResolvedValueOnce({ data: { permissions: [] } })

    const store = useChannelsStore()
    store.channels = [{
      id: 'meeting-channel-1',
      name: 'meeting-1',
      purpose: 'meeting',
      is_voice: true
    }]

    await store.select('meeting-channel-1')

    expect(apiMock.patch).toHaveBeenCalledTimes(1)
    expect(apiMock.patch.mock.calls[0][0]).toBe('/channel-read-state')
    expect(apiMock.patch.mock.calls[0][1]).toMatchObject({
      channel_id: 'meeting-channel-1'
    })
    expect(typeof apiMock.patch.mock.calls[0][1].last_read_at).toBe('string')
  })

  it('does not mark a historical meeting chat as read without membership', async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { data: [{ id: 'membership-other', user_id: 'user-other' }] } })
      .mockResolvedValueOnce({ data: { permissions: [] } })

    const store = useChannelsStore()
    store.channels = [{
      id: 'meeting-channel-1',
      name: 'meeting-1',
      purpose: 'meeting',
      is_voice: true
    }]
    store.myMembership = { id: 'previous-membership', channel_id: 'channel-previous', user_id: 'user-self' }

    await store.select('meeting-channel-1')

    expect(store.myMembership).toBe(null)
    expect(apiMock.patch).not.toHaveBeenCalled()
  })

  it('stops retrying membership-rejected watermarks after switching channels', async () => {
    vi.useFakeTimers()
    const membershipRequiredError = {
      response: {
        status: 403,
        data: {
          data: {
            error_code: 'api.channels.membership_required'
          }
        }
      }
    }
    apiMock.patch.mockRejectedValue(membershipRequiredError)

    const store = useChannelsStore()
    await expect(store.queueReadWatermark(
      'meeting-channel-1',
      '2026-03-15T09:00:00.000Z',
      { immediate: true }
    )).rejects.toBe(membershipRequiredError)

    store.activeChannelId = 'channel-2'
    await store.queueReadWatermark('meeting-channel-1', '2026-03-15T09:05:00.000Z')
    await vi.advanceTimersByTimeAsync(500)
    await flushAsyncWork()

    expect(apiMock.patch).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('unblocks read watermarks when membership is later confirmed', async () => {
    const membershipRequiredError = {
      response: {
        status: 403,
        data: {
          data: {
            error_code: 'api.channels.membership_required'
          }
        }
      }
    }
    apiMock.patch
      .mockRejectedValueOnce(membershipRequiredError)
      .mockResolvedValueOnce({ data: { updated: true } })

    const store = useChannelsStore()
    await expect(store.queueReadWatermark(
      'meeting-channel-1',
      '2026-03-15T09:00:00.000Z',
      { immediate: true }
    )).rejects.toBe(membershipRequiredError)

    store.activeChannelId = 'meeting-channel-1'
    apiMock.get.mockResolvedValueOnce({
      data: { data: [{ id: 'membership-1', user_id: 'user-self' }] }
    })
    await store.refreshMembers()
    await store.queueReadWatermark(
      'meeting-channel-1',
      '2026-03-15T09:05:00.000Z',
      { immediate: true }
    )

    expect(apiMock.patch).toHaveBeenCalledTimes(2)
  })

  it('keeps retrying read watermarks after transient failures', async () => {
    vi.useFakeTimers()
    const transientError = new Error('Network unavailable')
    apiMock.patch
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ data: { updated: true } })

    const store = useChannelsStore()
    await expect(store.queueReadWatermark(
      'channel-1',
      '2026-03-15T09:00:00.000Z',
      { immediate: true }
    )).rejects.toBe(transientError)

    await vi.advanceTimersByTimeAsync(250)
    await flushAsyncWork()

    expect(apiMock.patch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('flushes all pending watermarks on page hide', async () => {
    apiMock.patch.mockResolvedValue({ data: { updated: true } })
    const documentStub = new EventTarget()
    Object.defineProperty(documentStub, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    const windowStub = new EventTarget()
    vi.stubGlobal('document', documentStub)
    vi.stubGlobal('window', windowStub)

    const store = useChannelsStore()
    await store.queueReadWatermark('channel-1', '2026-03-15T09:00:00.000Z')

    documentStub.dispatchEvent(new Event('visibilitychange'))
    await flushAsyncWork()

    expect(apiMock.patch).toHaveBeenCalledWith('/channel-read-state', {
      channel_id: 'channel-1',
      last_read_at: '2026-03-15T09:00:00.000Z'
    })

    vi.unstubAllGlobals()
  })

  it('keeps newer optimistic watermark state when an older in-flight request resolves', async () => {
    let resolveFirstPatch
    apiMock.patch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirstPatch = resolve
    }))
    apiMock.patch.mockResolvedValueOnce({ data: { updated: true } })

    const store = useChannelsStore()
    const firstFlush = store.queueReadWatermark('channel-1', '2026-03-15T09:00:00.000Z', { immediate: true })
    await store.queueReadWatermark('channel-1', '2026-03-15T09:05:00.000Z')

    resolveFirstPatch({ data: { updated: true } })
    await firstFlush
    await store.flushReadWatermark('channel-1')

    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/channel-read-state', {
      channel_id: 'channel-1',
      last_read_at: '2026-03-15T09:05:00.000Z'
    })
    expect(store.unreadCounts['channel-1']).toBe(0)
  })
})
