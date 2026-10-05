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
const relayUserStatus = vi.hoisted(() => ({ status: 'online' }))

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
        if (url.startsWith('/users/')) return { data: { id: 'self', status: relayUserStatus.status } }
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
    relayUserStatus.status = 'online'
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

  it.each(['online', 'dnd'])('uses current server status for background summary delivery (%s)', async status => {
    const profile = createProfile('profile-background')
    profile.authState.user = { id: 'self', status: status === 'online' ? 'dnd' : 'online' }
    desktopStateMock.activeProfileId = 'profile-active'
    desktopStateMock.profiles = [profile]
    relayUserStatus.status = status
    vi.stubGlobal('document', { visibilityState: 'visible' })
    startDesktopBackgroundRelay()
    await flushRelayStart()
    const handlers = new Map()
    const socket = { on: (event, handler) => handlers.set(event, handler), off: vi.fn() }
    createSocketClientCalls[0].subscribeToSocketAuthenticated.mock.calls[0][0](socket)
    const notification = { id: 'summary', type: 'meeting_summary_ready', meeting_id: 'meeting', actor_display_name: 'Nebulynk', message_snippet: 'Summary ready' }
    handlers.get('notifications created')(notification)
    handlers.get('notifications created')(notification)
    await flushRelayStart()
    await flushRelayStart()
    if (status === 'dnd') {
      expect(showDesktopNotificationMock).not.toHaveBeenCalled()
      expect(playSfxMock).not.toHaveBeenCalled()
    } else expect(showDesktopNotificationMock).toHaveBeenCalledExactlyOnceWith({
      title: 'Nebulynk', body: 'Summary ready', serverId: 'profile-background', route: '/meetings/meeting?tab=summary'
    })
    expect(updateDesktopProfileNotificationStateMock).toHaveBeenCalledWith('profile-background', { unreadCount: 1, lastNotificationId: 'summary' })
    vi.unstubAllGlobals()
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
