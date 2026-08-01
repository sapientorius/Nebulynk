import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  startDesktopBackgroundRelay,
  stopDesktopBackgroundRelay
} from '../../src/lib/desktop-background-relay.js'

const watchState = vi.hoisted(() => ({
  getter: null,
  callback: null
}))

const desktopStateMock = vi.hoisted(() => ({
  activeProfileId: null,
  profiles: []
}))

const updateDesktopProfileNotificationStateMock = vi.hoisted(() => vi.fn(async () => {}))
const updateDesktopProfileSessionMock = vi.hoisted(() => vi.fn(async () => {}))
const showDesktopNotificationMock = vi.hoisted(() => vi.fn(async () => true))
const playSfxMock = vi.hoisted(() => vi.fn())
const createSocketClientCalls = vi.hoisted(() => [])

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    watch: vi.fn((getter, callback, options = {}) => {
      watchState.getter = getter
      watchState.callback = callback
      if (options.immediate) {
        callback(getter(), undefined)
      }
      return () => {
        watchState.getter = null
        watchState.callback = null
      }
    })
  }
})

vi.mock('../../src/lib/api-client.js', () => ({
  createApiClient: vi.fn((options = {}) => ({
    http: {
      get: vi.fn(async (url) => {
        if (url === '/notifications') {
          return {
            data: {
              data: [],
              unread_total: 0
            }
          }
        }
        if (url === '/meetings') {
          return {
            data: {
              data: []
            }
          }
        }
        throw new Error(`Unexpected desktop relay GET ${url}`)
      })
    },
    options
  }))
}))

vi.mock('../../src/lib/socket-client.js', () => ({
  createSocketClient: vi.fn((context) => {
    const entry = {
      context,
      subscribeToSocketAuthenticated: vi.fn(),
      connectSocket: vi.fn(),
      destroy: vi.fn()
    }
    createSocketClientCalls.push(entry)
    return entry
  })
}))

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  showDesktopNotification: showDesktopNotificationMock
}))

vi.mock('../../src/lib/sfx.js', () => ({
  playSfx: playSfxMock,
  SFX_EVENTS: {
    NOTIFICATION: 'notification'
  }
}))

vi.mock('../../src/lib/desktop-server-url.js', () => ({
  resolveDesktopApiBaseUrl: (baseUrl) => `${baseUrl}/api`
}))

vi.mock('../../src/lib/desktop-runtime.js', () => ({
  desktopState: desktopStateMock,
  getDesktopProfileById: (profileId) => desktopStateMock.profiles.find((profile) => profile.id === profileId) || null,
  updateDesktopProfileNotificationState: updateDesktopProfileNotificationStateMock,
  updateDesktopProfileSession: updateDesktopProfileSessionMock
}))

function createProfile(id, {
  enabled = true,
  accessToken = `token-${id}`
} = {}) {
  return {
    id,
    baseUrl: `https://${id}.example.com`,
    authState: {
      accessToken
    },
    notificationPreferences: {
      enabled
    },
    notificationState: {
      unreadCount: 0,
      lastNotificationId: null
    }
  }
}

async function triggerRelayWatch() {
  const nextValue = watchState.getter?.()
  await watchState.callback?.(nextValue, undefined)
  await Promise.resolve()
  await Promise.resolve()
}

async function flushRelayStart() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('desktop background relay', () => {
  beforeEach(() => {
    desktopStateMock.activeProfileId = null
    desktopStateMock.profiles = []
    createSocketClientCalls.length = 0
    updateDesktopProfileNotificationStateMock.mockReset()
    updateDesktopProfileSessionMock.mockReset()
    showDesktopNotificationMock.mockReset()
    playSfxMock.mockReset()
  })

  afterEach(() => {
    stopDesktopBackgroundRelay()
  })

  it('starts relay connections only for enabled background profiles', async () => {
    desktopStateMock.activeProfileId = 'profile-active'
    desktopStateMock.profiles = [
      createProfile('profile-active'),
      createProfile('profile-enabled', { enabled: true }),
      createProfile('profile-disabled', { enabled: false })
    ]

    startDesktopBackgroundRelay()
    await flushRelayStart()

    expect(createSocketClientCalls).toHaveLength(1)
    expect(createSocketClientCalls[0].context.apiClient.options.baseUrl).toBe('https://profile-enabled.example.com/api')
    expect(createSocketClientCalls[0].connectSocket).toHaveBeenCalledTimes(1)
  })

  it('stops an existing relay when a profile disables desktop notifications', async () => {
    const enabledProfile = createProfile('profile-enabled', { enabled: true })
    desktopStateMock.activeProfileId = 'profile-active'
    desktopStateMock.profiles = [
      createProfile('profile-active'),
      enabledProfile
    ]

    startDesktopBackgroundRelay()
    await flushRelayStart()

    expect(createSocketClientCalls).toHaveLength(1)

    enabledProfile.notificationPreferences.enabled = false
    await triggerRelayWatch()

    expect(createSocketClientCalls[0].destroy).toHaveBeenCalledTimes(1)
  })

  it('starts a new relay when a signed-in background profile enables notifications later', async () => {
    const disabledProfile = createProfile('profile-disabled', { enabled: false })
    desktopStateMock.activeProfileId = 'profile-active'
    desktopStateMock.profiles = [
      createProfile('profile-active'),
      disabledProfile
    ]

    startDesktopBackgroundRelay()
    await flushRelayStart()
    expect(createSocketClientCalls).toHaveLength(0)

    disabledProfile.notificationPreferences.enabled = true
    await triggerRelayWatch()

    expect(createSocketClientCalls).toHaveLength(1)
    expect(createSocketClientCalls[0].connectSocket).toHaveBeenCalledTimes(1)
  })
})
