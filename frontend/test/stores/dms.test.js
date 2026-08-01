import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDmsStore } from '../../src/stores/dms.js'
import { setLocale } from '../../src/lib/i18n.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const channelsStoreMock = vi.hoisted(() => ({
  select: vi.fn(),
  leaveChannel: vi.fn()
}))

const routerMock = vi.hoisted(() => ({
  push: vi.fn()
}))

const sessionStoreMock = vi.hoisted(() => ({
  user: { id: 'user-self' },
  allUsers: [],
  onlineUserIds: [],
  primeUsers: vi.fn(),
  getUserById: vi.fn(),
  resolveUserPresence: vi.fn(() => ({
    isConnected: false,
    displayStatus: 'offline',
    badgeStatus: 'offline',
    isPendingSync: false
  }))
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

vi.mock('../../src/stores/session.js', () => ({
  useSessionStore: () => sessionStoreMock
}))

vi.mock('../../src/router/index.js', () => ({
  default: routerMock
}))

describe('dms store refreshChannel', () => {
  let dateNowSpy

  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.patch.mockReset()
    apiMock.delete.mockReset()
    channelsStoreMock.select.mockReset()
    channelsStoreMock.leaveChannel.mockReset()
    routerMock.push.mockReset()
    routerMock.push.mockResolvedValue(undefined)
    sessionStoreMock.primeUsers.mockReset()
    sessionStoreMock.getUserById.mockReset()
    sessionStoreMock.resolveUserPresence.mockReset()
    sessionStoreMock.resolveUserPresence.mockReturnValue({
      isConnected: false,
      displayStatus: 'offline',
      badgeStatus: 'offline',
      isPendingSync: false
    })
    dateNowSpy?.mockRestore?.()
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    const store = useDmsStore()
    store.reset()
    setLocale('en', { persist: false })
  })

  it('patches an existing dm entry and inserts unknown channels', async () => {
    const store = useDmsStore()
    store.dmChannels = [{
      id: 'group-1',
      type: 'group',
      name: 'Old Group',
      participants: [{ user_id: 'user-self' }]
    }]

    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'group-1',
        type: 'group',
        name: 'New Group',
        participants: [{ user_id: 'user-self' }, { user_id: 'user-2' }]
      }
    })

    const updated = await store.refreshChannel('group-1')

    expect(apiMock.get).toHaveBeenCalledWith('/dms/group-1')
    expect(updated?.name).toBe('New Group')
    expect(store.dmChannels).toHaveLength(1)
    expect(store.dmChannels[0].participants).toHaveLength(2)

    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'group-2',
        type: 'group',
        name: 'Inserted Group',
        participants: [{ user_id: 'user-self' }, { user_id: 'user-3' }]
      }
    })

    const inserted = await store.refreshChannel('group-2')

    expect(inserted?.id).toBe('group-2')
    expect(store.dmChannels[0].id).toBe('group-2')
    expect(store.dmChannels).toHaveLength(2)
  })

  it('removes local channel entry when refresh returns 403 or 404', async () => {
    const store = useDmsStore()
    store.dmChannels = [
      { id: 'group-1', type: 'group' },
      { id: 'group-2', type: 'group' }
    ]

    apiMock.get.mockRejectedValueOnce({ response: { status: 404 } })
    const notFoundResult = await store.refreshChannel('group-1')

    expect(notFoundResult).toBe(null)
    expect(store.dmChannels.map((entry) => entry.id)).toEqual(['group-2'])

    apiMock.get.mockRejectedValueOnce({ response: { status: 403 } })
    const forbiddenResult = await store.refreshChannel('group-2')

    expect(forbiddenResult).toBe(null)
    expect(store.dmChannels).toEqual([])
  })

  it('reuses fresh dm list data unless a force refresh is requested', async () => {
    const store = useDmsStore()
    apiMock.get
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'dm-1',
            type: 'dm',
            name: 'dm-1',
            created_by: 'user-other',
            created_at: '2026-06-20T10:00:00.000Z',
            participants: [
              { user_id: 'user-self', display_name: 'Self User' },
              { user_id: 'user-2', display_name: 'Other User' }
            ]
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'dm-2',
            type: 'dm',
            name: 'dm-2',
            created_by: 'user-other',
            created_at: '2026-06-20T11:00:00.000Z',
            participants: [
              { user_id: 'user-self', display_name: 'Self User' },
              { user_id: 'user-3', display_name: 'Third User' }
            ]
          }]
        }
      })

    await store.refresh()
    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(store.dmChannels.map((channel) => channel.id)).toEqual(['dm-1'])

    dateNowSpy.mockReturnValue(5_000)
    await store.refresh()

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(store.dmChannels.map((channel) => channel.id)).toEqual(['dm-1'])

    await store.refresh({ force: true })

    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(store.dmChannels.map((channel) => channel.id)).toEqual(['dm-2'])
  })

  it('deduplicates in-flight dm list refreshes', async () => {
    const store = useDmsStore()
    let resolveRequest

    apiMock.get.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const firstRefresh = store.refresh()
    const secondRefresh = store.refresh()

    expect(apiMock.get).toHaveBeenCalledTimes(1)

    resolveRequest({
      data: {
        data: [{
          id: 'dm-1',
          type: 'dm',
          name: 'dm-1',
          created_by: 'user-other',
          created_at: '2026-06-20T10:00:00.000Z',
          participants: [
            { user_id: 'user-self', display_name: 'Self User' },
            { user_id: 'user-2', display_name: 'Other User' }
          ]
        }]
      }
    })

    await Promise.all([firstRefresh, secondRefresh])

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(store.dmChannels.map((channel) => channel.id)).toEqual(['dm-1'])
  })

  it('uses the unified session presence resolver for dm display metadata', () => {
    const store = useDmsStore()
    const dmChannel = {
      id: 'dm-1',
      type: 'dm',
      participants: [
        { user_id: 'user-self', display_name: 'Self User' },
        { user_id: 'user-2', display_name: 'Other User', avatar_url: '/avatar-other.png', status: 'offline' }
      ]
    }

    sessionStoreMock.getUserById.mockReturnValue({
      id: 'user-2',
      display_name: 'Other User',
      avatar_url: '/avatar-live.png',
      status: 'offline'
    })
    sessionStoreMock.resolveUserPresence.mockReturnValue({
      isConnected: true,
      displayStatus: 'offline',
      badgeStatus: 'offline',
      isPendingSync: false
    })

    const info = store.displayInfo(dmChannel)

    expect(sessionStoreMock.resolveUserPresence).toHaveBeenCalledWith({
      id: 'user-2',
      display_name: 'Other User',
      avatar_url: '/avatar-live.png',
      status: 'offline'
    })
    expect(info).toEqual({
      name: 'Other User',
      avatarInitial: 'O',
      avatarUrl: '/avatar-live.png',
      userId: 'user-2',
      isOnline: true,
      status: 'offline',
      badgeStatus: 'offline',
      memberCount: 2
    })
  })

  it('recognizes, labels, and pins the personal notes dm first', async () => {
    const store = useDmsStore()
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'dm-regular',
            type: 'dm',
            name: 'dm-regular',
            created_by: 'user-other',
            created_at: '2026-06-20T10:00:00.000Z',
            last_message_at: '2026-06-20T10:00:00.000Z',
            participants: [
              { user_id: 'user-self', display_name: 'Self User' },
              { user_id: 'user-2', display_name: 'Other User' }
            ]
          },
          {
            id: 'dm-notes',
            type: 'dm',
            name: 'notes',
            created_by: 'user-self',
            created_at: '2026-06-20T09:00:00.000Z',
            last_message_at: '2026-06-20T09:00:00.000Z',
            participants: [
              { user_id: 'user-self', display_name: 'Self User' }
            ]
          }
        ]
      }
    })

    await store.refresh()

    expect(store.dmChannels.map((channel) => channel.id)).toEqual(['dm-notes', 'dm-regular'])
    expect(store.isNotesChannel(store.dmChannels[0])).toBe(true)
    expect(store.displayInfo(store.dmChannels[0])).toMatchObject({
      name: 'Notes',
      avatarInitial: 'N',
      userId: 'user-self',
      memberCount: 1
    })

    setLocale('de', { persist: false })
    expect(store.displayInfo(store.dmChannels[0]).name).toBe('Notizen')
  })

  it('opens the personal notes dm through the existing channel route', async () => {
    const store = useDmsStore()
    store.dmChannels = [{
      id: 'dm-notes',
      type: 'dm',
      name: 'notes',
      created_by: 'user-self',
      participants: [{ user_id: 'user-self', display_name: 'Self User' }]
    }]

    const opened = await store.openNotes()

    expect(opened?.id).toBe('dm-notes')
    expect(channelsStoreMock.select).toHaveBeenCalledWith('dm-notes')
    expect(routerMock.push).toHaveBeenCalledWith('/channels/dm-notes')
    expect(apiMock.get).not.toHaveBeenCalled()
  })
})
