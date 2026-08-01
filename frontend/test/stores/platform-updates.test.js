import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({
  getPlatformUpdates: vi.fn(),
  checkPlatformUpdates: vi.fn(),
  acknowledgePlatformUpdates: vi.fn(),
  updatePlatformUpdateSettings: vi.fn(),
  beginPlatformUpdateSettingsPasskeyOptions: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => api)

import { usePlatformUpdatesStore } from '../../src/stores/platform-updates.js'

function status() {
  return {
    checks_enabled: true,
    comparison_status: 'security_update_available',
    releases: [
      { version: '0.3.0', revision: 1, acknowledged: false, security_applicable: false, highest_security_severity: null },
      { version: '0.4.0', revision: 2, acknowledged: false, security_applicable: true, highest_security_severity: 'high' }
    ]
  }
}

describe('platform update store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates status loads and derives per-admin badge state', async () => {
    let resolveLoad
    api.getPlatformUpdates.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve }))
    const store = usePlatformUpdatesStore()
    const first = store.load()
    const second = store.load()
    expect(api.getPlatformUpdates).toHaveBeenCalledTimes(1)
    resolveLoad(status())
    await Promise.all([first, second])

    expect(store.unacknowledgedCount).toBe(2)
    expect(store.unacknowledgedSecurityCount).toBe(1)
    expect(store.hasUnacknowledgedSecurity).toBe(true)
    expect(store.unacknowledgedSecuritySeverity).toBe('high')
  })

  it('acknowledges all visible releases for the current administrator', async () => {
    api.getPlatformUpdates.mockResolvedValue(status())
    api.acknowledgePlatformUpdates.mockResolvedValue({
      ...status(),
      releases: status().releases.map((release) => ({ ...release, acknowledged: true }))
    })
    const store = usePlatformUpdatesStore()
    await store.load()
    await store.acknowledgeAll()

    expect(api.acknowledgePlatformUpdates).toHaveBeenCalledWith(['0.3.0', '0.4.0'])
    expect(store.unacknowledgedCount).toBe(0)
  })

  it('keeps manual checks and owner settings as separate API operations', async () => {
    api.checkPlatformUpdates.mockResolvedValue(status())
    api.updatePlatformUpdateSettings.mockResolvedValue({ ...status(), checks_enabled: false })
    const store = usePlatformUpdatesStore()

    await store.checkNow()
    await store.setChecksEnabled({
      checks_enabled: false,
      confirmation: 'DISABLE_UPDATE_CHECKS',
      reauth: { method: 'password', current_password: 'secret' }
    })

    expect(api.checkPlatformUpdates).toHaveBeenCalledTimes(1)
    expect(api.updatePlatformUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ checks_enabled: false }))
    expect(store.status.checks_enabled).toBe(false)
  })
})
