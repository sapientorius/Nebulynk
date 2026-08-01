import { isProxy, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeDesktopMock = vi.hoisted(() => vi.fn())
const listenDesktopMock = vi.hoisted(() => vi.fn(async () => () => {}))
const updateDesktopWindowStateMock = vi.hoisted(() => vi.fn())
const triggerExternalPttDownMock = vi.hoisted(() => vi.fn())
const triggerExternalPttUpMock = vi.hoisted(() => vi.fn())
const setDesktopPttBindingStatusMock = vi.hoisted(() => vi.fn())
const micSettingsState = vi.hoisted(() => ({
  mode: 'live',
  pttKey: 'Space'
}))
const activeMicSettingsListenerState = vi.hoisted(() => ({
  listener: null
}))
const getModeMock = vi.hoisted(() => vi.fn(() => micSettingsState.mode))
const getPttKeyMock = vi.hoisted(() => vi.fn(() => micSettingsState.pttKey))
const setModeMock = vi.hoisted(() => vi.fn((mode) => {
  micSettingsState.mode = mode
}))
const setPttKeyMock = vi.hoisted(() => vi.fn((pttKey) => {
  micSettingsState.pttKey = pttKey
}))
const subscribeToSettingsMock = vi.hoisted(() => vi.fn((listener) => {
  activeMicSettingsListenerState.listener = listener
  listener({
    mode: micSettingsState.mode,
    pttKey: micSettingsState.pttKey
  })
  return () => {
    if (activeMicSettingsListenerState.listener === listener) {
      activeMicSettingsListenerState.listener = null
    }
  }
}))

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  invokeDesktop: invokeDesktopMock,
  listenDesktop: listenDesktopMock,
  openServerManager: vi.fn(async () => {})
}))

vi.mock('../../src/lib/desktop-window-state.js', () => ({
  updateDesktopWindowState: updateDesktopWindowStateMock
}))

vi.mock('../../src/lib/mic-activation.js', () => ({
  triggerExternalPttDown: triggerExternalPttDownMock,
  triggerExternalPttUp: triggerExternalPttUpMock,
  setDesktopPttBindingStatus: setDesktopPttBindingStatusMock,
  subscribeToSettings: subscribeToSettingsMock,
  getMode: getModeMock,
  getPttKey: getPttKeyMock,
  setMode: setModeMock,
  setPttKey: setPttKeyMock
}))

vi.mock('../../src/lib/runtime.js', async () => {
  const actual = await vi.importActual('../../src/lib/runtime.js')
  return {
    ...actual,
    isDesktopWorkspaceWindow: () => true
  }
})

describe('desktop workspace bridge', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeDesktopMock.mockReset()
    listenDesktopMock.mockReset()
    listenDesktopMock.mockResolvedValue(() => {})
    updateDesktopWindowStateMock.mockReset()
    triggerExternalPttDownMock.mockReset()
    triggerExternalPttUpMock.mockReset()
    setDesktopPttBindingStatusMock.mockReset()
    getModeMock.mockClear()
    getPttKeyMock.mockClear()
    setModeMock.mockClear()
    setPttKeyMock.mockClear()
    subscribeToSettingsMock.mockReset()
    micSettingsState.mode = 'live'
    micSettingsState.pttKey = 'Space'
    activeMicSettingsListenerState.listener = null
    subscribeToSettingsMock.mockImplementation((listener) => {
      activeMicSettingsListenerState.listener = listener
      listener({
        mode: micSettingsState.mode,
        pttKey: micSettingsState.pttKey
      })
      return () => {
        if (activeMicSettingsListenerState.listener === listener) {
          activeMicSettingsListenerState.listener = null
        }
      }
    })
  })

  it('loads the active profile snapshot during initialization', async () => {
    invokeDesktopMock.mockResolvedValueOnce({
      profileId: 'profile-1',
      baseUrl: 'https://chat.example.com',
      route: '/channels/channel-1',
      authState: {
        accessToken: 'token'
      },
      notificationPreferences: {
        enabled: false,
        permission: 'granted'
      },
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyV'
      },
      pttBindingStatus: {
        mode: 'global-raw-input',
        keyCode: 'KeyV',
        isGlobal: true,
        usesRawInput: true,
        allowPassThrough: true,
        platform: 'windows'
      }
    })

    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    const snapshot = await bridgeModule.initializeDesktopWorkspaceBridge()

    expect(snapshot.profileId).toBe('profile-1')
    expect(bridgeModule.getDesktopWorkspaceInitialAuthState()).toEqual({
      accessToken: 'token',
      refreshToken: null,
      csrfToken: null,
      sessionTransport: 'body',
      user: null
    })
    expect(bridgeModule.getDesktopWorkspaceProfileContext()).toEqual({
      profileId: 'profile-1',
      baseUrl: 'https://chat.example.com',
      route: '/channels/channel-1'
    })
    expect(bridgeModule.getDesktopWorkspaceNotificationState()).toEqual({
      enabled: false,
      permission: 'granted'
    })
    expect(setModeMock).toHaveBeenCalledWith('ptt')
    expect(setPttKeyMock).toHaveBeenCalledWith('KeyV')
    expect(setDesktopPttBindingStatusMock).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'global-raw-input',
      keyCode: 'KeyV'
    }))
  })

  it('does not overwrite a desktop snapshot ptt config with the initial live defaults', async () => {
    invokeDesktopMock.mockResolvedValueOnce({
      profileId: 'profile-1',
      baseUrl: 'https://chat.example.com',
      route: '/channels/channel-1',
      authState: {
        accessToken: 'token'
      },
      notificationPreferences: {
        enabled: true,
        permission: 'granted'
      },
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyV'
      },
      pttBindingStatus: {
        mode: 'global-native',
        keyCode: 'KeyV',
        isGlobal: true,
        usesNativeHook: true,
        allowPassThrough: true,
        platform: 'windows'
      }
    })

    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    await bridgeModule.initializeDesktopWorkspaceBridge()

    invokeDesktopMock.mockReset()
    invokeDesktopMock.mockResolvedValue(null)
    subscribeToSettingsMock.mockImplementation((listener) => {
      activeMicSettingsListenerState.listener = listener
      listener({
        mode: 'live',
        pttKey: 'Space'
      })
      return () => {
        if (activeMicSettingsListenerState.listener === listener) {
          activeMicSettingsListenerState.listener = null
        }
      }
    })

    bridgeModule.startDesktopWorkspaceBridge({
      router: {
        currentRoute: {
          value: {
            fullPath: '/channels/channel-1'
          }
        },
        afterEach() {
          return () => {}
        }
      }
    })

    const pttSyncCalls = invokeDesktopMock.mock.calls.filter(([command]) => command === 'desktop_sync_active_ptt_config')
    expect(pttSyncCalls).toHaveLength(0)
  })

  it('syncs route, session, notification preferences, and ptt config through desktop commands', async () => {
    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    invokeDesktopMock.mockResolvedValue(null)

    await bridgeModule.syncDesktopWorkspaceSession({ accessToken: 'token-2' })
    await bridgeModule.syncDesktopWorkspaceRoute('/meetings/meeting-1')
    await bridgeModule.syncDesktopWorkspaceNotificationPreferences({
      enabled: true,
      permission: 'granted'
    })
    await bridgeModule.syncDesktopWorkspacePttConfig({
      mode: 'ptt',
      pttKey: 'KeyK'
    })

    expect(invokeDesktopMock).toHaveBeenNthCalledWith(1, 'desktop_sync_active_session', {
      authState: expect.objectContaining({
        accessToken: 'token-2'
      })
    })
    expect(invokeDesktopMock).toHaveBeenNthCalledWith(2, 'desktop_sync_active_route', {
      route: '/meetings/meeting-1'
    })
    expect(invokeDesktopMock).toHaveBeenNthCalledWith(3, 'desktop_sync_active_notification_preferences', {
      notificationPreferences: {
        enabled: true,
        permission: 'granted'
      }
    })
    expect(invokeDesktopMock).toHaveBeenNthCalledWith(4, 'desktop_sync_active_ptt_config', {
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyK'
      }
    })
  })

  it('keeps the desktop ptt mirror retryable when the IPC sync fails', async () => {
    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    invokeDesktopMock
      .mockRejectedValueOnce(new Error('ipc unavailable'))
      .mockResolvedValueOnce(null)

    await expect(bridgeModule.syncDesktopWorkspacePttConfig({
      mode: 'ptt',
      pttKey: 'KeyK'
    })).rejects.toThrow(/ipc unavailable/i)

    await bridgeModule.syncDesktopWorkspacePttConfig({
      mode: 'ptt',
      pttKey: 'KeyK'
    })

    const pttSyncCalls = invokeDesktopMock.mock.calls.filter(([command]) => command === 'desktop_sync_active_ptt_config')
    expect(pttSyncCalls).toHaveLength(2)
    expect(pttSyncCalls[0][1]).toEqual({
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyK'
      }
    })
    expect(pttSyncCalls[1][1]).toEqual({
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyK'
      }
    })
  })

  it('sends a plain auth snapshot to Electron instead of the reactive workspace auth object', async () => {
    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    invokeDesktopMock.mockResolvedValue(null)
    const reactiveUser = reactive({
      id: 'user-1',
      display_name: 'Alex Example',
      meeting_video_preferences: {
        background_mode: 'blur'
      }
    })

    await bridgeModule.syncDesktopWorkspaceSession({
      accessToken: 'token-2',
      csrfToken: 'csrf-2',
      refreshToken: 'refresh-2',
      sessionTransport: 'body',
      user: reactiveUser
    })

    const sessionCall = invokeDesktopMock.mock.calls.find(([command]) => command === 'desktop_sync_active_session')
    expect(sessionCall).toBeTruthy()
    expect(isProxy(sessionCall[1].authState)).toBe(false)
    expect(isProxy(sessionCall[1].authState.user)).toBe(false)
    expect(sessionCall[1].authState).toEqual({
      accessToken: 'token-2',
      refreshToken: 'refresh-2',
      csrfToken: 'csrf-2',
      sessionTransport: 'body',
      user: {
        id: 'user-1',
        display_name: 'Alex Example',
        meeting_video_preferences: {
          background_mode: 'blur'
        }
      }
    })
  })

  it('syncs changed mic settings to the active desktop workspace profile after startup', async () => {
    invokeDesktopMock.mockResolvedValueOnce({
      profileId: 'profile-1',
      baseUrl: 'https://chat.example.com',
      route: '/channels/channel-1',
      authState: {
        accessToken: 'token'
      },
      notificationPreferences: {
        enabled: true,
        permission: 'granted'
      },
      pttConfig: {
        mode: 'live',
        pttKey: 'Space'
      },
      pttBindingStatus: {
        mode: 'focused-only',
        keyCode: null,
        isGlobal: false,
        usesNativeHook: false,
        allowPassThrough: true,
        platform: 'windows'
      }
    })

    const bridgeModule = await import('../../src/lib/desktop-workspace-bridge.js')
    await bridgeModule.initializeDesktopWorkspaceBridge()

    invokeDesktopMock.mockReset()
    invokeDesktopMock.mockResolvedValue(null)
    subscribeToSettingsMock.mockImplementation((listener) => {
      activeMicSettingsListenerState.listener = listener
      listener({
        mode: 'live',
        pttKey: 'Space'
      })
      return () => {
        if (activeMicSettingsListenerState.listener === listener) {
          activeMicSettingsListenerState.listener = null
        }
      }
    })

    bridgeModule.startDesktopWorkspaceBridge({
      router: {
        currentRoute: {
          value: {
            fullPath: '/channels/channel-1'
          }
        },
        afterEach() {
          return () => {}
        }
      }
    })

    activeMicSettingsListenerState.listener?.({
      mode: 'ptt',
      pttKey: 'KeyK'
    })

    const pttSyncCalls = invokeDesktopMock.mock.calls.filter(([command]) => command === 'desktop_sync_active_ptt_config')
    expect(pttSyncCalls).toHaveLength(1)
    expect(invokeDesktopMock).toHaveBeenCalledWith('desktop_sync_active_ptt_config', {
      pttConfig: {
        mode: 'ptt',
        pttKey: 'KeyK'
      }
    })
  })
})
