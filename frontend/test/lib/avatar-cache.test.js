import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getStoredAccessTokenMock = vi.hoisted(() => vi.fn(() => 'avatar-token'))

vi.mock('../../src/lib/api.js', () => ({
  getStoredAccessToken: getStoredAccessTokenMock,
  resolveApiUrl: vi.fn((path) => `http://127.0.0.1:3031${path.replace(/^\/api/, '')}`)
}))

describe('avatar cache helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    getStoredAccessTokenMock.mockReset()
    getStoredAccessTokenMock.mockReturnValue('avatar-token')
    globalThis.fetch = vi.fn()
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:avatar-1')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  afterEach(async () => {
    const { clearAvatarCache } = await import('../../src/lib/avatar-cache.js')
    clearAvatarCache()
  })

  it('fetches managed avatar urls with auth headers and caches the object url', async () => {
    const { resolveAvatarSource } = await import('../../src/lib/avatar-cache.js')
    const blob = new Blob(['avatar'], { type: 'image/webp' })
    globalThis.fetch.mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob)
    })

    const first = await resolveAvatarSource('/api/users/user-1/avatar?v=1')
    const second = await resolveAvatarSource('/api/users/user-1/avatar?v=1')

    expect(first).toBe('blob:avatar-1')
    expect(second).toBe('blob:avatar-1')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:3031/users/user-1/avatar?v=1', {
      headers: {
        Authorization: 'Bearer avatar-token'
      }
    })
  })

  it('returns legacy or external avatar urls unchanged', async () => {
    const { resolveAvatarSource } = await import('../../src/lib/avatar-cache.js')

    await expect(resolveAvatarSource('https://example.com/avatar.png')).resolves.toBe('https://example.com/avatar.png')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
