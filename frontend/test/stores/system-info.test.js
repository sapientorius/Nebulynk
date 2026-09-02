import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  getSystemStorageUsage: vi.fn(),
  refreshSystemStorageUsage: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => api)

import { useSystemInfoStore } from '../../src/stores/system-info.js'

function usage(overrides = {}) {
  return {
    state: 'fresh',
    snapshot_at: '2026-09-02T12:00:00.000Z',
    age_seconds: 0,
    database: { available: true, bytes: '1048576' },
    object_storage: {
      available: true,
      bytes: '3145728',
      files: { bytes: '2097152', object_count: 4 },
      meeting_recordings: { bytes: '1048576', object_count: 1 }
    },
    total_bytes: '4194304',
    ...overrides
  }
}

describe('system info store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates the initial storage-usage request and keeps its snapshot', async () => {
    let resolveLoad
    api.getSystemStorageUsage.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    const store = useSystemInfoStore()

    const first = store.load()
    const second = store.load()
    expect(api.getSystemStorageUsage).toHaveBeenCalledTimes(1)

    resolveLoad(usage())
    await Promise.all([first, second])
    await store.load()

    expect(api.getSystemStorageUsage).toHaveBeenCalledTimes(1)
    expect(store.storageUsage.total_bytes).toBe('4194304')
  })

  it('uses the immediate refresh endpoint, coalesces concurrent clicks, and replaces the snapshot', async () => {
    let resolveRefresh
    api.refreshSystemStorageUsage.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve }))
    const store = useSystemInfoStore()
    store.storageUsage = usage()

    const first = store.refresh()
    const second = store.refresh()
    expect(api.refreshSystemStorageUsage).toHaveBeenCalledTimes(1)
    expect(store.refreshing).toBe(true)

    resolveRefresh(usage({ state: 'stale', age_seconds: 601, total_bytes: '8388608' }))
    await Promise.all([first, second])

    expect(store.refreshing).toBe(false)
    expect(store.storageUsage.total_bytes).toBe('8388608')
  })

  it('exposes loading and refresh failures while retaining the last successful values', async () => {
    const loadError = new Error('unavailable')
    api.getSystemStorageUsage.mockRejectedValue(loadError)
    const store = useSystemInfoStore()

    await expect(store.load()).rejects.toBe(loadError)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(loadError)

    store.storageUsage = usage()
    const refreshError = new Error('refresh unavailable')
    api.refreshSystemStorageUsage.mockRejectedValue(refreshError)
    await expect(store.refresh()).rejects.toBe(refreshError)

    expect(store.refreshing).toBe(false)
    expect(store.error).toBe(refreshError)
    expect(store.storageUsage.total_bytes).toBe('4194304')
  })
})
