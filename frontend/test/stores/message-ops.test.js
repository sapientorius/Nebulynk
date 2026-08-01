import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageOpsStore } from '../../src/stores/message-ops.js'

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

describe('message-ops store', () => {
  beforeEach(() => {
    resetApiMock()
  })

  it('validates required messageId for edit and delete', async () => {
    const store = useMessageOpsStore()

    await expect(store.editMessage('', 'Hi')).rejects.toThrow('messageId is required')
    await expect(store.deleteMessage(null)).rejects.toThrow('messageId is required')
  })

  it('maps edit endpoint and payload', async () => {
    const store = useMessageOpsStore()
    apiMock.patch.mockResolvedValue({ data: { id: 'message-1', content: 'Updated' } })

    await store.editMessage('message-1', 'Updated')

    expect(apiMock.patch).toHaveBeenCalledWith('/messages/message-1', { content: 'Updated' })
  })

  it('toggles reaction by removing own reaction when present', async () => {
    const store = useMessageOpsStore()
    apiMock.delete.mockResolvedValue({ data: {} })

    await store.toggleReaction({
      message: {
        id: 'message-1',
        reactions: [{
          emoji: '🔥',
          users: [{ id: 'reaction-1', user_id: 'user-1' }]
        }]
      },
      currentUserId: 'user-1',
      emoji: '🔥'
    })

    expect(apiMock.delete).toHaveBeenCalledWith('/reactions/reaction-1')
  })

  it('toggles reaction by creating reaction when own reaction is missing', async () => {
    const store = useMessageOpsStore()
    apiMock.post.mockResolvedValue({ data: { id: 'reaction-2' } })

    await store.toggleReaction({
      message: {
        id: 'message-1',
        reactions: []
      },
      currentUserId: 'user-1',
      emoji: '🔥'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/reactions', {
      message_id: 'message-1',
      emoji: '🔥'
    })
  })
})
