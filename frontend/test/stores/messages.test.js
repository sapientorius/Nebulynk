import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessagesStore } from '../../src/stores/messages.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const currentUserMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getCurrentUser: currentUserMock
}))

const channelsStoreMock = vi.hoisted(() => ({
  activeChannelId: null
}))

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
}

describe('messages store', () => {
  beforeEach(() => {
    resetApiMock()
    channelsStoreMock.activeChannelId = null
    currentUserMock.mockReset()
    currentUserMock.mockReturnValue(null)
  })

  it('does not send without active channel or content/files', async () => {
    const store = useMessagesStore()

    channelsStoreMock.activeChannelId = null
    await store.send('hello')

    channelsStoreMock.activeChannelId = 'channel-1'
    await store.send('   ')

    expect(apiMock.post).not.toHaveBeenCalled()
  })

  it('sends trimmed content and file_ids, then dedupes by message id', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    apiMock.post.mockResolvedValue({ data: { id: 'message-1', content: 'hello' } })

    await store.send(' hello ', { fileIds: ['file-1'] })
    await store.send(' hello ', { fileIds: ['file-1'] })

    expect(apiMock.post).toHaveBeenCalledWith('/messages', {
      channel_id: 'channel-1',
      content: 'hello',
      file_ids: ['file-1']
    })
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].id).toBe('message-1')
  })

  it('sends replies with reply_to_message_id and clears the reply context', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.setReplyContext({ id: 'message-parent', user_display_name: 'User One', content: 'Parent' })
    apiMock.post.mockResolvedValue({ data: { id: 'message-2', content: 'reply' } })

    await store.send(' reply ', { replyToMessageId: store.replyContext.id })

    expect(apiMock.post).toHaveBeenCalledWith('/messages', {
      channel_id: 'channel-1',
      content: 'reply',
      reply_to_message_id: 'message-parent'
    })
    expect(store.replyContext).toBeNull()
  })

  it('dedupes older-page results against already inserted highlighted messages', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.messages = [{
      id: 'message-1',
      channel_id: 'channel-1',
      content: 'hello',
      created_at: '2026-03-14T01:00:00.000Z'
    }]
    store.hasMoreOlder = true

    apiMock.get.mockResolvedValue({
      data: {
        has_more_before: false,
        data: [{
          id: 'message-1',
          channel_id: 'channel-1',
          content: 'hello',
          created_at: '2026-03-14T01:00:00.000Z'
        }]
      }
    })

    await store.loadOlder()

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].id).toBe('message-1')
    expect(apiMock.get).toHaveBeenCalledWith('/messages', {
      params: {
        channel_id: 'channel-1',
        $limit: 50,
        before: '2026-03-14T01:00:00.000Z',
        before_id: 'message-1'
      }
    })
  })

  it('loads anchored context for a historic search result and tracks newer availability', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    apiMock.get.mockResolvedValue({
      data: {
        anchor_message_id: 'message-2',
        has_more_before: true,
        has_more_after: true,
        data: [
          { id: 'message-1', channel_id: 'channel-1', created_at: '2026-03-14T01:00:00.000Z' },
          { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z' },
          { id: 'message-3', channel_id: 'channel-1', created_at: '2026-03-14T01:02:00.000Z' }
        ]
      }
    })

    await store.loadAroundMessage('message-2')

    expect(store.timelineMode).toBe('anchored')
    expect(store.anchorMessageId).toBe('message-2')
    expect(store.hasMoreOlder).toBe(true)
    expect(store.hasMoreNewer).toBe(true)
    expect(store.messages.map((message) => message.id)).toEqual(['message-1', 'message-2', 'message-3'])
    expect(apiMock.get).toHaveBeenCalledWith('/messages', {
      params: {
        channel_id: 'channel-1',
        around_message_id: 'message-2'
      }
    })
  })

  it('dedupes duplicate ids from anchored context responses and keeps stable ordering for equal timestamps', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    apiMock.get.mockResolvedValue({
      data: {
        anchor_message_id: 'message-2',
        has_more_before: false,
        has_more_after: false,
        data: [
          { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z', content: 'anchor' },
          { id: 'message-1', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z', content: 'older' },
          { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z', content: 'anchor newest' }
        ]
      }
    })

    await store.loadAroundMessage('message-2')

    expect(store.messages.map((message) => message.id)).toEqual(['message-1', 'message-2'])
    expect(store.messages[1].content).toBe('anchor newest')
  })

  it('clears the highlighted message when anchored loading fails', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.setHighlightedMessage('message-2')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    apiMock.get.mockRejectedValue(new Error('not found'))

    const result = await store.loadAroundMessage('message-2')

    expect(result).toBeNull()
    expect(store.highlightedMessageId).toBeNull()
    errorSpy.mockRestore()
  })

  it('loads newer messages below anchored context without duplicates', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.messages = [
      { id: 'message-1', channel_id: 'channel-1', created_at: '2026-03-14T01:00:00.000Z' },
      { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z' }
    ]
    store.timelineMode = 'anchored'
    store.hasMoreOlder = true
    store.hasMoreNewer = true
    store.anchorMessageId = 'message-2'

    apiMock.get.mockResolvedValue({
      data: {
        has_more_after: false,
        data: [
          { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z' },
          { id: 'message-3', channel_id: 'channel-1', created_at: '2026-03-14T01:02:00.000Z' }
        ]
      }
    })

    await store.loadNewer()

    expect(store.messages.map((message) => message.id)).toEqual(['message-1', 'message-2', 'message-3'])
    expect(store.hasMoreNewer).toBe(false)
    expect(apiMock.get).toHaveBeenCalledWith('/messages', {
      params: {
        channel_id: 'channel-1',
        $limit: 50,
        after: '2026-03-14T01:01:00.000Z',
        after_id: 'message-2'
      }
    })
  })

  it('returns to the latest timeline after anchored navigation', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.timelineMode = 'anchored'
    store.hasMoreOlder = true
    store.hasMoreNewer = true
    store.anchorMessageId = 'message-2'

    apiMock.get.mockResolvedValue({
      data: {
        has_more_before: true,
        data: [
          { id: 'message-9', channel_id: 'channel-1', created_at: '2026-03-14T01:09:00.000Z' },
          { id: 'message-10', channel_id: 'channel-1', created_at: '2026-03-14T01:10:00.000Z' }
        ]
      }
    })

    await store.returnToLatest()

    expect(store.timelineMode).toBe('latest')
    expect(store.anchorMessageId).toBeNull()
    expect(store.hasMoreNewer).toBe(false)
    expect(store.messages.map((message) => message.id)).toEqual(['message-9', 'message-10'])
  })

  it('syncs the active latest timeline by loading newer messages', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.messages = [
      { id: 'message-1', channel_id: 'channel-1', created_at: '2026-03-14T01:00:00.000Z' },
      { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z' }
    ]
    store.timelineMode = 'latest'

    apiMock.get.mockResolvedValue({
      data: {
        has_more_after: false,
        data: [
          { id: 'message-2', channel_id: 'channel-1', created_at: '2026-03-14T01:01:00.000Z' },
          { id: 'message-3', channel_id: 'channel-1', created_at: '2026-03-14T01:02:00.000Z' }
        ]
      }
    })

    await store.syncActiveTimelineFromLatest()

    expect(store.messages.map((message) => message.id)).toEqual(['message-1', 'message-2', 'message-3'])
    expect(apiMock.get).toHaveBeenCalledWith('/messages', {
      params: {
        channel_id: 'channel-1',
        $limit: 50,
        after: '2026-03-14T01:01:00.000Z',
        after_id: 'message-2'
      }
    })
  })

  it('falls back to loadLatest when the active latest timeline is empty', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.timelineMode = 'latest'

    apiMock.get.mockResolvedValue({
      data: {
        has_more_before: false,
        data: [
          { id: 'message-9', channel_id: 'channel-1', created_at: '2026-03-14T01:09:00.000Z' }
        ]
      }
    })

    await store.syncActiveTimelineFromLatest()

    expect(store.messages.map((message) => message.id)).toEqual(['message-9'])
    expect(apiMock.get).toHaveBeenCalledWith('/messages', {
      params: {
        channel_id: 'channel-1',
        $limit: 50
      }
    })
  })

  it('leaves anchored timelines untouched during latest sync catch-up', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    store.timelineMode = 'anchored'
    store.messages = [
      { id: 'message-1', channel_id: 'channel-1', created_at: '2026-03-14T01:00:00.000Z' }
    ]

    await store.syncActiveTimelineFromLatest()

    expect(apiMock.get).not.toHaveBeenCalled()
    expect(store.messages.map((message) => message.id)).toEqual(['message-1'])
  })

  it('forwards through the dedicated endpoint', async () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'
    apiMock.post.mockResolvedValue({ data: { id: 'forward-1', channel_id: 'channel-2', content: 'hello' } })

    await store.forward({
      sourceMessageId: 'message-1',
      targetChannelId: 'channel-2',
      comment: 'FYI'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/messages/forward', {
      source_message_id: 'message-1',
      target_channel_id: 'channel-2',
      comment: 'FYI'
    })
    expect(store.messages).toEqual([])
  })

  it('applies reaction create/remove mutations', () => {
    const store = useMessagesStore()
    store.messages = [{
      id: 'message-1',
      reactions: []
    }]

    store.applyReactionCreated({
      id: 'reaction-1',
      message_id: 'message-1',
      emoji: '🔥',
      user_id: 'user-1',
      user_display_name: 'User One'
    })
    store.applyReactionCreated({
      id: 'reaction-2',
      message_id: 'message-1',
      emoji: '🔥',
      user_id: 'user-2',
      user_display_name: 'User Two'
    })

    expect(store.messages[0].reactions[0].count).toBe(2)

    store.applyReactionRemoved({
      message_id: 'message-1',
      emoji: '🔥',
      user_id: 'user-1'
    })
    expect(store.messages[0].reactions[0].count).toBe(1)

    store.applyReactionRemoved({
      message_id: 'message-1',
      emoji: '🔥',
      user_id: 'user-2'
    })
    expect(store.messages[0].reactions).toEqual([])
  })

  it('adds pins only for active channel and keeps pins unique', () => {
    const store = useMessagesStore()
    channelsStoreMock.activeChannelId = 'channel-1'

    store.addPin({ id: 'pin-other', channel_id: 'channel-2' })
    store.addPin({ id: 'pin-1', channel_id: 'channel-1' })
    store.addPin({ id: 'pin-1', channel_id: 'channel-1' })

    expect(store.pinnedMessages).toEqual([{ id: 'pin-1', channel_id: 'channel-1' }])
  })

  it('merges partial message patches without dropping hydrated fields', () => {
    const store = useMessagesStore()
    store.messages = [{
      id: 'message-1',
      channel_id: 'channel-1',
      type: 'file',
      content: 'before',
      created_at: '2026-03-14T01:00:00.000Z',
      user_display_name: 'User One',
      user_avatar_url: '/avatar.png',
      files: [{ id: 'file-1', original_name: 'image.png' }],
      reactions: [{ emoji: ':wave:', count: 1, users: [] }]
    }]

    store.replaceMessage({
      id: 'message-1',
      content: 'after',
      edited_at: '2026-03-14T01:05:00.000Z'
    })

    expect(store.messages).toEqual([{
      id: 'message-1',
      channel_id: 'channel-1',
      type: 'file',
      content: 'after',
      created_at: '2026-03-14T01:00:00.000Z',
      edited_at: '2026-03-14T01:05:00.000Z',
      user_display_name: 'User One',
      user_avatar_url: '/avatar.png',
      files: [{ id: 'file-1', original_name: 'image.png' }],
      reactions: [{ emoji: ':wave:', count: 1, users: [] }]
    }])
  })

  it('keeps channel drafts isolated and persists them per current user', () => {
    currentUserMock.mockReturnValue({ id: 'user-1' })
    const store = useMessagesStore()

    store.setDraftText('channel-1', 'hello channel one')
    store.setDraftText('channel-2', 'hello channel two')
    store.addDraftFile('channel-1', {
      id: 'file-1',
      original_name: 'spec.pdf',
      mime_type: 'application/pdf',
      size: 1234,
      purpose: 'attachment',
      url: '/signed-url'
    })

    expect(store.getDraft('channel-1').text).toBe('hello channel one')
    expect(store.getDraft('channel-2').text).toBe('hello channel two')
    expect(store.getDraft('channel-1').files).toEqual([{
      id: 'file-1',
      original_name: 'spec.pdf',
      mime_type: 'application/pdf',
      size: 1234,
      purpose: 'attachment',
      duration_ms: null,
      url: '/signed-url'
    }])

    const stored = JSON.parse(localStorage.getItem('nebulynk:message-drafts:v1:user-1'))
    expect(stored['channel-1'].text).toBe('hello channel one')
    expect(stored['channel-1'].files).toEqual([{
      id: 'file-1',
      original_name: 'spec.pdf',
      mime_type: 'application/pdf',
      size: 1234,
      purpose: 'attachment',
      duration_ms: null
    }])
  })

  it('hydrates persisted drafts and removes empty drafts from storage', () => {
    currentUserMock.mockReturnValue({ id: 'user-1' })
    localStorage.setItem('nebulynk:message-drafts:v1:user-1', JSON.stringify({
      'channel-1': {
        text: 'persisted',
        files: [{
          id: 'file-1',
          original_name: 'image.png',
          mime_type: 'image/png',
          size: 456,
          purpose: 'attachment',
          url: '/stale-url'
        }],
        updated_at: '2026-04-13T00:00:00.000Z'
      }
    }))

    const store = useMessagesStore()

    expect(store.getDraft('channel-1')).toEqual({
      text: 'persisted',
      files: [{
        id: 'file-1',
        original_name: 'image.png',
        mime_type: 'image/png',
        size: 456,
        purpose: 'attachment',
        duration_ms: null
      }],
      updated_at: '2026-04-13T00:00:00.000Z'
    })

    store.setDraftText('channel-1', '')
    store.removeDraftFile('channel-1', 'file-1')

    expect(store.getDraft('channel-1')).toEqual({
      text: '',
      files: [],
      updated_at: null
    })
    expect(localStorage.getItem('nebulynk:message-drafts:v1:user-1')).toBeNull()
  })

  it('hydrates draft files with fresh URLs and drops unreadable files', async () => {
    currentUserMock.mockReturnValue({ id: 'user-1' })
    const store = useMessagesStore()
    store.setDraftText('channel-1', 'with files')
    store.addDraftFile('channel-1', { id: 'file-1', original_name: 'old.pdf', mime_type: 'application/pdf', size: 1 })
    store.addDraftFile('channel-1', { id: 'file-2', original_name: 'gone.pdf', mime_type: 'application/pdf', size: 2 })

    apiMock.get.mockImplementation((url) => {
      if (url === '/files/file-1') {
        return Promise.resolve({
          data: {
            id: 'file-1',
            original_name: 'fresh.pdf',
            mime_type: 'application/pdf',
            size: 999,
            purpose: 'attachment',
            duration_ms: null,
            url: '/fresh-url'
          }
        })
      }
      return Promise.reject(new Error('not found'))
    })

    await store.hydrateDraftFiles('channel-1')

    expect(store.getDraft('channel-1').files).toEqual([{
      id: 'file-1',
      original_name: 'fresh.pdf',
      mime_type: 'application/pdf',
      size: 999,
      purpose: 'attachment',
      duration_ms: null,
      url: '/fresh-url'
    }])
    expect(store.draftFilesHydratingByChannel['channel-1']).toBe(false)
  })

  it('clears draft state and storage for the current user', () => {
    currentUserMock.mockReturnValue({ id: 'user-1' })
    const store = useMessagesStore()
    store.setDraftText('channel-1', 'bye')

    store.clearStoredDrafts()

    expect(store.getDraft('channel-1').text).toBe('')
    expect(localStorage.getItem('nebulynk:message-drafts:v1:user-1')).toBeNull()
  })
})
