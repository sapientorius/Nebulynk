import { describe, expect, it, vi } from 'vitest'
import { startDesktopEventBridge } from '../../src/lib/desktop-event-bridge.js'

const revealDesktopWindowMock = vi.hoisted(() => vi.fn(async () => {}))
const listenDesktopMock = vi.hoisted(() => vi.fn(async () => () => {}))
const listenDesktopNotificationActionsMock = vi.hoisted(() => vi.fn(async (handler) => {
  listenDesktopNotificationActionsMock.handler = handler
  return () => {
    listenDesktopNotificationActionsMock.handler = null
  }
}))

const setActiveDesktopProfileMock = vi.hoisted(() => vi.fn(async () => null))
const setDesktopProfileLastRouteMock = vi.hoisted(() => vi.fn(async () => {}))
const sessionStoreMock = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  init: vi.fn(async () => {})
}))

const desktopProfiles = vi.hoisted(() => ({
  activeProfile: { id: 'profile-1', authState: { accessToken: 'token-1' } },
  byId: new Map()
}))

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  listenDesktop: listenDesktopMock,
  revealDesktopWindow: revealDesktopWindowMock
}))

vi.mock('../../src/lib/desktop-notification-plugin.js', () => ({
  listenDesktopNotificationActions: listenDesktopNotificationActionsMock
}))

vi.mock('../../src/lib/desktop-window-state.js', () => ({
  updateDesktopWindowState: vi.fn()
}))

vi.mock('../../src/lib/desktop-notification-route.js', () => ({
  normalizeDesktopNotificationTarget: (payload) => ({
    serverId: payload?.serverId || null,
    route: payload?.route || '/channels'
  })
}))

vi.mock('../../src/lib/desktop-runtime.js', () => ({
  getActiveDesktopProfile: () => desktopProfiles.activeProfile,
  getDesktopProfileById: (profileId) => desktopProfiles.byId.get(profileId) || null,
  setActiveDesktopProfile: setActiveDesktopProfileMock,
  setDesktopProfileLastRoute: setDesktopProfileLastRouteMock
}))

vi.mock('../../src/lib/mic-activation.js', () => ({
  triggerExternalPttDown: vi.fn(),
  triggerExternalPttUp: vi.fn()
}))

vi.mock('../../src/stores/session.js', () => ({
  useSessionStore: () => sessionStoreMock
}))

describe('desktop event bridge', () => {
  it('opens native desktop notification actions on the targeted profile route', async () => {
    const targetProfile = {
      id: 'profile-2',
      authState: {
        accessToken: 'token-2'
      }
    }
    desktopProfiles.activeProfile = {
      id: 'profile-1',
      authState: {
        accessToken: 'token-1'
      }
    }
    desktopProfiles.byId = new Map([
      ['profile-2', targetProfile]
    ])
    setActiveDesktopProfileMock.mockResolvedValue(targetProfile)

    const router = {
      push: vi.fn(async () => {}),
      afterEach: vi.fn(() => () => {})
    }

    await startDesktopEventBridge({
      pinia: {},
      router
    })

    await listenDesktopNotificationActionsMock.handler({
      serverId: 'profile-2',
      route: '/meetings/meeting-1'
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(revealDesktopWindowMock).toHaveBeenCalledTimes(1)
    expect(sessionStoreMock.destroy).toHaveBeenCalledTimes(1)
    expect(setActiveDesktopProfileMock).toHaveBeenCalledWith('profile-2')
    expect(sessionStoreMock.init).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/meetings/meeting-1')
  })
})
