import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageSummariesStore } from '../../src/stores/message-summaries.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getCurrentUser: vi.fn(() => null)
}))

describe('message summaries store', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.delete.mockReset()
    useMessageSummariesStore().reset()
  })

  it('loads private summaries for the current message window', async () => {
    const store = useMessageSummariesStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'summary-2',
            channel_id: 'channel-1',
            status: 'ready',
            created_at: '2026-04-17T09:30:00.000Z',
            source_ended_at: '2026-04-17T09:10:00.000Z'
          },
          {
            id: 'summary-1',
            channel_id: 'channel-1',
            status: 'ready',
            created_at: '2026-04-17T09:05:00.000Z'
          }
        ]
      }
    })

    await store.loadForWindow({
      channelId: 'channel-1',
      windowStartAt: '2026-04-17T09:00:00.000Z',
      windowEndAt: '2026-04-17T09:10:00.000Z'
    })

    expect(apiMock.get).toHaveBeenCalledWith('/message-summaries', {
      params: {
        channel_id: 'channel-1',
        window_start_at: '2026-04-17T09:00:00.000Z',
        window_end_at: '2026-04-17T09:10:00.000Z'
      }
    })
    expect(store.summariesForChannel('channel-1')).toHaveLength(2)
    expect(store.summariesForChannel('channel-1').map((summary) => summary.id)).toEqual(['summary-1', 'summary-2'])
  })

  it('reuses the cached summary slice when the loaded message window is unchanged', async () => {
    const store = useMessageSummariesStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: [{ id: 'summary-1', channel_id: 'channel-1', status: 'ready', created_at: '2026-04-17T09:05:00.000Z' }]
      }
    })

    await store.loadForWindow({
      channelId: 'channel-1',
      windowStartAt: '2026-04-17T09:00:00.000Z',
      windowEndAt: '2026-04-17T09:10:00.000Z'
    })
    await store.loadForWindow({
      channelId: 'channel-1',
      windowStartAt: '2026-04-17T09:00:00.000Z',
      windowEndAt: '2026-04-17T09:10:00.000Z'
    })

    expect(apiMock.get).toHaveBeenCalledTimes(1)
  })

  it('requests message, selection, and range summaries', async () => {
    const store = useMessageSummariesStore()
    apiMock.post.mockResolvedValue({
      data: {
        id: 'summary-1',
        channel_id: 'channel-1',
        status: 'processing',
        created_at: '2026-04-17T09:00:00.000Z'
      }
    })

    await store.requestMessageSummary({ id: 'message-1', channel_id: 'channel-1' })
    store.startSelection()
    store.toggleSelected('message-1')
    store.toggleSelected('message-2')
    await store.requestSelectedSummary('channel-1')
    await store.requestRangeSummary('channel-1', { range_preset: 'last_24h' })

    expect(apiMock.post).toHaveBeenNthCalledWith(1, '/message-summaries', {
      channel_id: 'channel-1',
      scope: 'message',
      message_id: 'message-1'
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(2, '/message-summaries', {
      channel_id: 'channel-1',
      scope: 'selection',
      message_ids: ['message-1', 'message-2']
    })
    expect(apiMock.post).toHaveBeenNthCalledWith(3, '/message-summaries', {
      channel_id: 'channel-1',
      scope: 'range',
      range_preset: 'last_24h'
    })
  })

  it('ingests realtime summary patches only when they overlap the active loaded window', async () => {
    const store = useMessageSummariesStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: []
      }
    })

    await store.loadForWindow({
      channelId: 'channel-1',
      windowStartAt: '2026-04-17T09:00:00.000Z',
      windowEndAt: '2026-04-17T09:10:00.000Z'
    })

    store.applyRealtimeSummary({
      id: 'summary-1',
      channel_id: 'channel-1',
      status: 'processing',
      source_started_at: '2026-04-17T09:00:00.000Z',
      source_ended_at: '2026-04-17T09:00:00.000Z',
      created_at: '2026-04-17T09:00:00.000Z'
    })
    store.applyRealtimeSummary({
      id: 'summary-1',
      channel_id: 'channel-1',
      status: 'ready',
      summary: 'Ready',
      source_started_at: '2026-04-17T09:00:00.000Z',
      source_ended_at: '2026-04-17T09:00:00.000Z',
      created_at: '2026-04-17T09:00:00.000Z'
    })
    store.applyRealtimeSummary({
      id: 'summary-2',
      channel_id: 'channel-1',
      status: 'ready',
      created_at: '2026-04-17T09:20:00.000Z',
      source_started_at: '2026-04-17T08:55:00.000Z',
      source_ended_at: '2026-04-17T08:55:00.000Z'
    })

    expect(store.summariesForChannel('channel-1')).toHaveLength(1)
    expect(store.summariesForChannel('channel-1')[0].id).toBe('summary-1')
    expect(store.summariesForChannel('channel-1')[0].status).toBe('ready')
  })

  it('removes summaries locally after delete and realtime removal', async () => {
    const store = useMessageSummariesStore()
    const summary = {
      id: 'summary-1',
      channel_id: 'channel-1',
      status: 'ready',
      created_at: '2026-04-17T09:00:00.000Z'
    }
    apiMock.delete.mockResolvedValue({ data: summary })

    store.ingestSummary(summary)
    await store.deleteSummary(summary)

    expect(apiMock.delete).toHaveBeenCalledWith('/message-summaries/summary-1')
    expect(store.summariesForChannel('channel-1')).toHaveLength(0)

    store.ingestSummary(summary)
    store.applyRealtimeSummaryRemoved(summary)

    expect(store.summariesForChannel('channel-1')).toHaveLength(0)
  })
})
