import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGifSearchStore } from '../../src/stores/gif-search.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  getPlatformStatus: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getPlatformStatus: apiMock.getPlatformStatus,
  getCurrentUser: vi.fn(() => null)
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.getPlatformStatus.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
}

describe('gif-search store', () => {
  beforeEach(() => {
    resetApiMock()
  })

  it('loads trending gifs and normalizes Feathers data wrapper', async () => {
    const store = useGifSearchStore()
    apiMock.get.mockResolvedValue({ data: { data: [{ id: 'gif-1' }] } })

    const result = await store.loadTrending(10)

    expect(apiMock.get).toHaveBeenCalledWith('/gifs', { params: { limit: 10 } })
    expect(result).toEqual([{ id: 'gif-1' }])
  })

  it('searches gifs and supports plain-array responses', async () => {
    const store = useGifSearchStore()
    apiMock.get.mockResolvedValue({ data: [{ id: 'gif-2' }] })

    const result = await store.searchGifs('cat', 25)

    expect(apiMock.get).toHaveBeenCalledWith('/gifs', { params: { q: 'cat', limit: 25 } })
    expect(result).toEqual([{ id: 'gif-2' }])
  })

  it('loads Klipy availability from platform status', async () => {
    const store = useGifSearchStore()
    apiMock.getPlatformStatus.mockResolvedValue({ klipy_configured: true })

    await expect(store.loadConfiguration()).resolves.toBe(true)

    expect(store.klipyConfigured).toBe(true)
    expect(apiMock.getPlatformStatus).toHaveBeenCalledWith({})
  })
})
