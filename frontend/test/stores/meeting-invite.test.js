import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMeetingInviteStore } from '../../src/stores/meeting-invite.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

function resetMocks() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
}

describe('meeting-invite store', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('requires a token when loading invite metadata', async () => {
    const store = useMeetingInviteStore()

    await expect(store.loadInvite('')).rejects.toThrow('token is required')
  })

  it('loads invite metadata by token', async () => {
    const store = useMeetingInviteStore()
    apiMock.get.mockResolvedValue({ data: { meeting_id: 'meeting-1' } })

    const result = await store.loadInvite('token-123')

    expect(apiMock.get).toHaveBeenCalledWith('/meeting-invite', {
      params: { token: 'token-123' }
    })
    expect(result).toEqual({ meeting_id: 'meeting-1' })
  })

  it('accepts invite and maps the display name for the backend payload', async () => {
    const store = useMeetingInviteStore()
    apiMock.post.mockResolvedValue({
      data: {
        accessToken: 'jwt-token',
        meeting: { id: 'meeting-1' }
      }
    })

    const result = await store.acceptInvite({
      token: 'token-123',
      displayName: 'Guest Name'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/meeting-invite', {
      token: 'token-123',
      display_name: 'Guest Name'
    })
    expect(result).toEqual({
      accessToken: 'jwt-token',
      meeting: { id: 'meeting-1' }
    })
  })
})
