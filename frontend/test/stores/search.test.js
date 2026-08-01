import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchStore } from '../../src/stores/search.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

describe('search store', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
  })

  it('resets state when no query or filters are present', async () => {
    const store = useSearchStore()
    store.results = [{ id: 'existing' }]
    store.nextCursor = { before_id: 'x', before_created_at: '2026-03-16T00:00:00.000Z' }

    await store.runSearch()

    expect(apiMock.get).not.toHaveBeenCalled()
    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)
    expect(store.hasSearched).toBe(false)
  })

  it('validates short queries on the client before calling the API', async () => {
    const store = useSearchStore()
    store.setQuery('ab')
    store.results = [{ id: 'existing' }]
    store.nextCursor = { before_id: 'x', before_created_at: '2026-03-16T00:00:00.000Z' }

    await store.runSearch()

    expect(apiMock.get).not.toHaveBeenCalled()
    expect(store.validationMessage).toBe('search.validation.min_length')
    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)
    expect(store.hasSearched).toBe(false)
  })

  it('queries the new search endpoint with message filters', async () => {
    const store = useSearchStore()
    store.showDialog = true
    store.setQuery('alpha')
    store.setFilter('channelId', 'channel-1')
    store.setFilter('fromUserId', 'user-2')
    store.setFilter('after', '2026-03-01')
    store.setFilter('before', '2026-03-31')
    apiMock.get.mockResolvedValue({
      data: {
        data: [{
          id: 'message:1',
          document_type: 'message',
          title: null,
          snippet: 'alpha',
          channel: { id: 'channel-1', name: 'General' },
          author: { id: 'user-2', display_name: 'Bob' }
        }],
        next_cursor: {
          before_created_at: '2026-03-16T09:00:00.000Z',
          before_id: 'message:1'
        },
        requested_match_mode: 'hybrid',
        effective_match_mode: 'keyword'
      }
    })

    await store.runSearch()

    expect(apiMock.get).toHaveBeenCalledWith('/search', {
      params: {
        tab: 'messages',
        match_mode: 'hybrid',
        q: 'alpha',
        from_user_id: 'user-2',
        channel_id: 'channel-1',
        after: '2026-03-01',
        before: '2026-03-31'
      }
    })
    expect(store.results).toHaveLength(1)
    expect(store.nextCursor).toEqual({
      before_created_at: '2026-03-16T09:00:00.000Z',
      before_id: 'message:1'
    })
    expect(store.validationMessage).toBe('')
    expect(store.hasSearched).toBe(true)
  })

  it('adds file extension filter and cursor when loading more file results', async () => {
    const store = useSearchStore()
    store.setTab('files')
    store.setQuery('spec')
    store.setFilter('fileExtension', 'pdf')
    store.results = [{ id: 'file:1' }]
    store.nextCursor = {
      before_created_at: '2026-03-16T09:00:00.000Z',
      before_id: 'file:1'
    }
    apiMock.get.mockResolvedValue({
      data: {
        data: [{ id: 'file:2', document_type: 'file' }],
        next_cursor: null
      }
    })

    await store.loadMore()

    expect(apiMock.get).toHaveBeenCalledWith('/search', {
      params: {
        tab: 'files',
        match_mode: 'hybrid',
        q: 'spec',
        file_extension: 'pdf',
        before_created_at: '2026-03-16T09:00:00.000Z',
        before_id: 'file:1'
      }
    })
    expect(store.results).toEqual([{ id: 'file:1' }, { id: 'file:2', document_type: 'file' }])
    expect(store.hasSearched).toBe(true)
  })

  it('uses meeting chat plus transcript document types when the meetings author or speaker filter is active', async () => {
    const store = useSearchStore()
    store.setFilter('fromUserId', 'user-9')
    store.setTab('meetings')
    store.setQuery('weekly')
    store.setFilter('channelId', 'meeting-chat-1')
    apiMock.get.mockResolvedValue({
      data: {
        data: [{
          id: 'meeting_transcript_segment:1',
          document_type: 'meeting_transcript_segment'
        }],
        next_cursor: null
      }
    })

    await store.runSearch()

    expect(apiMock.get).toHaveBeenCalledWith('/search', {
      params: {
        tab: 'meetings',
        match_mode: 'hybrid',
        q: 'weekly',
        from_user_id: 'user-9',
        channel_id: 'meeting-chat-1',
        document_types: ['message', 'meeting_transcript_segment']
      }
    })
    expect(store.filters.fromUserId).toBe('user-9')
  })

  it('keeps the default meetings document types when no author or speaker filter is active', async () => {
    const store = useSearchStore()
    store.setTab('meetings')
    store.setQuery('weekly')
    apiMock.get.mockResolvedValue({
      data: {
        data: [{
          id: 'meeting_summary:1',
          document_type: 'meeting_summary'
        }],
        next_cursor: null
      }
    })

    await store.runSearch()

    expect(apiMock.get).toHaveBeenCalledWith('/search', {
      params: {
        tab: 'meetings',
        match_mode: 'hybrid',
        q: 'weekly',
        document_types: ['meeting_transcript', 'meeting_summary']
      }
    })
  })

  it('keeps results, cursor, and loading state isolated per tab', async () => {
    const store = useSearchStore()
    store.setTab('meetings')
    store.setQuery('weekly')
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'meeting_transcript:1', document_type: 'meeting_transcript' }],
        next_cursor: {
          before_created_at: '2026-03-28T08:00:00.000Z',
          before_id: 'meeting_transcript:1'
        }
      }
    })

    await store.runSearch()

    expect(store.results).toEqual([{ id: 'meeting_transcript:1', document_type: 'meeting_transcript' }])
    expect(store.nextCursor).toEqual({
      before_created_at: '2026-03-28T08:00:00.000Z',
      before_id: 'meeting_transcript:1'
    })
    expect(store.hasSearched).toBe(true)

    store.setTab('messages')

    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)
    expect(store.loading).toBe(false)
    expect(store.hasSearched).toBe(false)

    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'message:1', document_type: 'message' }],
        next_cursor: {
          before_created_at: '2026-03-27T07:00:00.000Z',
          before_id: 'message:1'
        }
      }
    })

    await store.runSearch()

    expect(store.results).toEqual([{ id: 'message:1', document_type: 'message' }])
    expect(store.nextCursor).toEqual({
      before_created_at: '2026-03-27T07:00:00.000Z',
      before_id: 'message:1'
    })
    expect(store.hasSearched).toBe(true)

    store.setTab('meetings')

    expect(store.results).toEqual([{ id: 'meeting_transcript:1', document_type: 'meeting_transcript' }])
    expect(store.nextCursor).toEqual({
      before_created_at: '2026-03-28T08:00:00.000Z',
      before_id: 'meeting_transcript:1'
    })
    expect(store.hasSearched).toBe(true)
  })

  it('keeps validation scoped to the searched tab', async () => {
    const store = useSearchStore()
    store.setTab('meetings')
    store.setQuery('ab')

    await store.runSearch()

    expect(store.validationMessage).toBe('search.validation.min_length')

    store.setTab('messages')

    expect(store.validationMessage).toBe('')
    expect(store.hasSearched).toBe(false)
  })

  it('resetSearchState clears only the active tab while resetAll clears every tab', async () => {
    const store = useSearchStore()
    store.setTab('meetings')
    store.results = [{ id: 'meeting_transcript:1' }]
    store.nextCursor = { before_id: 'meeting_transcript:1', before_created_at: '2026-03-28T08:00:00.000Z' }
    store.validationMessage = 'search.validation.min_length'

    store.setTab('messages')
    store.results = [{ id: 'message:1' }]
    store.nextCursor = { before_id: 'message:1', before_created_at: '2026-03-27T07:00:00.000Z' }

    store.resetSearchState()

    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)
    expect(store.validationMessage).toBe('')

    store.setTab('meetings')

    expect(store.results).toEqual([{ id: 'meeting_transcript:1' }])
    expect(store.nextCursor).toEqual({
      before_id: 'meeting_transcript:1',
      before_created_at: '2026-03-28T08:00:00.000Z'
    })
    expect(store.validationMessage).toBe('search.validation.min_length')

    store.resetAll()

    expect(store.activeTab).toBe('messages')
    expect(store.query).toBe('')
    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)

    store.setTab('meetings')

    expect(store.results).toEqual([])
    expect(store.nextCursor).toBe(null)
    expect(store.validationMessage).toBe('')
  })
})
