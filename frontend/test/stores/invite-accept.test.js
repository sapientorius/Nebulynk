import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInviteAcceptStore } from '../../src/stores/invite-accept.js'

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

describe('invite-accept store', () => {
  beforeEach(() => {
    resetApiMock()
  })

  it('requires token for loading invite', async () => {
    const store = useInviteAcceptStore()
    await expect(store.loadInvite('')).rejects.toThrow('token is required')
  })

  it('loads invite by token', async () => {
    const store = useInviteAcceptStore()
    apiMock.get.mockResolvedValue({ data: { id: 'invite-1' } })

    const result = await store.loadInvite('abc123')

    expect(apiMock.get).toHaveBeenCalledWith('/invite-accept', { params: { token: 'abc123' } })
    expect(result).toEqual({ id: 'invite-1' })
  })

  it('maps accept payload displayName -> display_name', async () => {
    const store = useInviteAcceptStore()
    apiMock.post.mockResolvedValue({ data: { success: true } })

    const result = await store.acceptInvite({
      token: 'abc123',
      displayName: 'Alice',
      password: 'secret'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/invite-accept', {
      token: 'abc123',
      display_name: 'Alice',
      password: 'secret'
    })
    expect(result).toEqual({ success: true })
  })
})
