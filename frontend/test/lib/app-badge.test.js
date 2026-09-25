import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncAppBadge } from '../../src/lib/app-badge.js'

describe('app badge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets the exact unread notification count when supported', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    await expect(syncAppBadge(125)).resolves.toBe(true)

    expect(setAppBadge).toHaveBeenCalledWith(125)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge when no notifications remain', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    await expect(syncAppBadge(0)).resolves.toBe(true)

    expect(clearAppBadge).toHaveBeenCalledTimes(1)
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('silently ignores unavailable or failing platform support', async () => {
    vi.stubGlobal('navigator', {})
    await expect(syncAppBadge(1)).resolves.toBe(false)

    vi.stubGlobal('navigator', {
      setAppBadge: vi.fn().mockRejectedValue(new Error('not allowed'))
    })
    await expect(syncAppBadge(1)).resolves.toBe(false)
  })
})
