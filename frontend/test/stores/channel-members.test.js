import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChannelMembersStore } from '../../src/stores/channel-members.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getCurrentUser: vi.fn(() => null)
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
}

describe('channel-members store', () => {
  beforeEach(() => {
    resetApiMock()
  })

  it('validates required arguments when adding a member', async () => {
    const store = useChannelMembersStore()

    await expect(store.addMember({ channelId: '', userId: 'user-1' })).rejects.toThrow('channelId is required')
    await expect(store.addMember({ channelId: 'channel-1', userId: '' })).rejects.toThrow('userId is required')
  })

  it('maps add member payload and returns response data', async () => {
    const store = useChannelMembersStore()
    apiMock.post.mockResolvedValue({ data: { id: 'member-1' } })

    const result = await store.addMember({ channelId: 'channel-1', userId: 'user-1' })

    expect(apiMock.post).toHaveBeenCalledWith('/channel-members', {
      channel_id: 'channel-1',
      user_id: 'user-1'
    })
    expect(result).toEqual({ id: 'member-1' })
  })

  it('validates and maps member removal endpoint', async () => {
    const store = useChannelMembersStore()
    await expect(store.removeMember('')).rejects.toThrow('memberId is required')

    apiMock.delete.mockResolvedValue({ data: {} })
    await store.removeMember('member-1')

    expect(apiMock.delete).toHaveBeenCalledWith('/channel-members/member-1')
  })
})
