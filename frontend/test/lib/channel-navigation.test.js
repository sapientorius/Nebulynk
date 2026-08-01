import { describe, expect, it, vi } from 'vitest'
import { resolveSidebarChannelRoute } from '../../src/lib/channel-navigation.js'

describe('resolveSidebarChannelRoute', () => {
  it('returns a channel route for regular channels without meeting context', async () => {
    const meetingsStore = {
      hasMeetingChatChannel: vi.fn(() => false),
      findMeetingByChatChannelId: vi.fn()
    }

    await expect(resolveSidebarChannelRoute('channel-1', { meetingsStore })).resolves.toBe('/channels/channel-1')
    expect(meetingsStore.findMeetingByChatChannelId).not.toHaveBeenCalled()
  })

  it('returns the meeting route when the selected channel is a meeting chat channel', async () => {
    const meetingsStore = {
      hasMeetingChatChannel: vi.fn(() => true),
      findMeetingByChatChannelId: vi.fn().mockResolvedValue({
        id: 'meeting-1'
      })
    }

    await expect(resolveSidebarChannelRoute('meeting-channel-1', { meetingsStore })).resolves.toBe('/meetings/meeting-1')
    expect(meetingsStore.findMeetingByChatChannelId).toHaveBeenCalledWith('meeting-channel-1', {
      refreshIfMissing: false
    })
  })

  it('refreshes meeting lookup when a known meeting chat channel is missing from the local cache', async () => {
    const meetingsStore = {
      hasMeetingChatChannel: vi.fn(() => true),
      findMeetingByChatChannelId: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'meeting-2' })
    }

    await expect(resolveSidebarChannelRoute('meeting-channel-2', { meetingsStore })).resolves.toBe('/meetings/meeting-2')
    expect(meetingsStore.findMeetingByChatChannelId).toHaveBeenNthCalledWith(1, 'meeting-channel-2', {
      refreshIfMissing: false
    })
    expect(meetingsStore.findMeetingByChatChannelId).toHaveBeenNthCalledWith(2, 'meeting-channel-2')
  })
})
