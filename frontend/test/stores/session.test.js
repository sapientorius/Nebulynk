import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../src/stores/session.js'

const DEFAULT_MEETING_VIDEO_PREFERENCES = {
 background_mode: 'none',
 preferred_camera_device_id: null,
 background_image_id: null,
 video_mirror: false
}

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const beginPasskeyAuthenticationRequestMock = vi.hoisted(() => vi.fn())
const beginPasskeyRegistrationRequestMock = vi.hoisted(() => vi.fn())
const changePasswordRequestMock = vi.hoisted(() => vi.fn())
const beginTwoFactorSetupRequestMock = vi.hoisted(() => vi.fn())
const confirmTwoFactorSetupRequestMock = vi.hoisted(() => vi.fn())
const deletePasskeyRequestMock = vi.hoisted(() => vi.fn())
const disableTwoFactorRequestMock = vi.hoisted(() => vi.fn())
const getPasskeysRequestMock = vi.hoisted(() => vi.fn())
const loginRequestMock = vi.hoisted(() => vi.fn())
const logoutRequestMock = vi.hoisted(() => vi.fn())
const getTwoFactorStatusRequestMock = vi.hoisted(() => vi.fn())
const regenerateTwoFactorRecoveryCodesRequestMock = vi.hoisted(() => vi.fn())
const setupPlatformRequestMock = vi.hoisted(() => vi.fn())
const clearStoredAuthMock = vi.hoisted(() => vi.fn())
const completeBrowserAuthenticationMock = vi.hoisted(() => vi.fn(async (data) => data))
const getCurrentUserMock = vi.hoisted(() => vi.fn(() => null))
const restoreBrowserSessionMock = vi.hoisted(() => vi.fn(async () => null))
const verifyPasskeyAuthenticationRequestMock = vi.hoisted(() => vi.fn())
const verifyPasskeyRegistrationRequestMock = vi.hoisted(() => vi.fn())
const verifyTwoFactorLoginRequestMock = vi.hoisted(() => vi.fn())
const applyLocaleForUserMock = vi.hoisted(() => vi.fn())

const disconnectSocketMock = vi.hoisted(() => vi.fn())
const connectSocketMock = vi.hoisted(() => vi.fn(() => ({})))
const subscribeToSocketAuthenticatedMock = vi.hoisted(() => vi.fn(() => () => {}))
const startForegroundChannelTrackingMock = vi.hoisted(() => vi.fn(() => vi.fn()))
const startForegroundResumeSyncMock = vi.hoisted(() => vi.fn())
const foregroundResumeRequestSyncMock = vi.hoisted(() => vi.fn())
const foregroundResumeStopMock = vi.hoisted(() => vi.fn())
const getActiveDesktopProfileMock = vi.hoisted(() => vi.fn(() => null))
const updateDesktopProfileSessionMock = vi.hoisted(() => vi.fn(async () => {}))
const clearDesktopProfileSessionMock = vi.hoisted(() => vi.fn(async () => {}))
const syncDesktopWorkspaceSessionMock = vi.hoisted(() => vi.fn(async () => {}))
const signalDesktopWorkspaceLogoutMock = vi.hoisted(() => vi.fn(async () => {}))

const channelsStoreMock = vi.hoisted(() => ({
  activeChannelId: null,
  channels: [],
  hasChannel: vi.fn(() => false),
  refresh: vi.fn(),
  refreshChannel: vi.fn(),
  reset: vi.fn()
}))
const dmsStoreMock = vi.hoisted(() => ({
  hasDmChannel: vi.fn(() => false),
  refresh: vi.fn(),
  refreshChannel: vi.fn(),
  reset: vi.fn()
}))
const messagesStoreMock = vi.hoisted(() => ({
  reset: vi.fn(),
  syncActiveTimelineFromLatest: vi.fn(),
  clearStoredDrafts: vi.fn()
}))
const notificationsStoreMock = vi.hoisted(() => ({
  syncNotificationState: vi.fn(),
  refreshUnreadCounts: vi.fn(),
  refreshNotifications: vi.fn(),
  reset: vi.fn()
}))
const voiceStoreMock = vi.hoisted(() => ({
  channelId: null,
  refreshParticipants: vi.fn(),
  reconnectIfNeeded: vi.fn(),
  leave: vi.fn(),
  reset: vi.fn()
}))
const uiStoreMock = vi.hoisted(() => ({
  reset: vi.fn()
}))
const meetingsStoreMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  reset: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  beginPasskeyAuthentication: beginPasskeyAuthenticationRequestMock,
  beginPasskeyRegistration: beginPasskeyRegistrationRequestMock,
  beginTwoFactorSetup: beginTwoFactorSetupRequestMock,
  changePassword: changePasswordRequestMock,
  clearStoredAuth: clearStoredAuthMock,
  completeBrowserAuthentication: completeBrowserAuthenticationMock,
  confirmTwoFactorSetup: confirmTwoFactorSetupRequestMock,
  deletePasskey: deletePasskeyRequestMock,
  disableTwoFactor: disableTwoFactorRequestMock,
  getCurrentUser: getCurrentUserMock,
  getPasskeys: getPasskeysRequestMock,
  getTwoFactorStatus: getTwoFactorStatusRequestMock,
  login: loginRequestMock,
  logout: logoutRequestMock,
  regenerateTwoFactorRecoveryCodes: regenerateTwoFactorRecoveryCodesRequestMock,
  restoreBrowserSession: restoreBrowserSessionMock,
  setupPlatform: setupPlatformRequestMock,
  verifyPasskeyAuthentication: verifyPasskeyAuthenticationRequestMock,
  verifyPasskeyRegistration: verifyPasskeyRegistrationRequestMock,
  verifyTwoFactorLogin: verifyTwoFactorLoginRequestMock
}))

vi.mock('../../src/lib/i18n.js', () => ({
  applyLocaleForUser: applyLocaleForUserMock
}))

vi.mock('../../src/lib/socket.js', () => ({
  connectSocket: connectSocketMock,
  disconnectSocket: disconnectSocketMock,
  subscribeToSocketAuthenticated: subscribeToSocketAuthenticatedMock
}))

vi.mock('../../src/lib/foreground-channel.js', () => ({
  startForegroundChannelTracking: startForegroundChannelTrackingMock
}))

vi.mock('../../src/lib/foreground-resume-sync.js', () => ({
  startForegroundResumeSync: startForegroundResumeSyncMock
}))

vi.mock('../../src/lib/desktop-runtime.js', () => ({
  clearDesktopProfileSession: clearDesktopProfileSessionMock,
  getActiveDesktopProfile: getActiveDesktopProfileMock,
  updateDesktopProfileSession: updateDesktopProfileSessionMock
}))

vi.mock('../../src/lib/desktop-workspace-bridge.js', () => ({
  signalDesktopWorkspaceLogout: signalDesktopWorkspaceLogoutMock,
  syncDesktopWorkspaceSession: syncDesktopWorkspaceSessionMock
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopWorkspaceWindow: () => false
}))

vi.mock('../../src/router/index.js', () => ({
  default: {}
}))

vi.mock('../../src/stores/realtime.js', () => ({
  setupRealtimeListeners: vi.fn()
}))

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

vi.mock('../../src/stores/dms.js', () => ({
  useDmsStore: () => dmsStoreMock
}))

vi.mock('../../src/stores/messages.js', () => ({
  useMessagesStore: () => messagesStoreMock
}))

vi.mock('../../src/stores/notifications.js', () => ({
  useNotificationsStore: () => notificationsStoreMock
}))

vi.mock('../../src/stores/voice.js', () => ({
  useVoiceStore: () => voiceStoreMock
}))

vi.mock('../../src/stores/ui.js', () => ({
  useUiStore: () => uiStoreMock
}))

vi.mock('../../src/stores/meetings.js', () => ({
  useMeetingsStore: () => meetingsStoreMock
}))

function resetMocks() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
  beginPasskeyAuthenticationRequestMock.mockReset()
  beginPasskeyRegistrationRequestMock.mockReset()
  beginTwoFactorSetupRequestMock.mockReset()
  changePasswordRequestMock.mockReset()
  confirmTwoFactorSetupRequestMock.mockReset()
  deletePasskeyRequestMock.mockReset()
  disableTwoFactorRequestMock.mockReset()
  getPasskeysRequestMock.mockReset()
  loginRequestMock.mockReset()
  logoutRequestMock.mockReset()
  getTwoFactorStatusRequestMock.mockReset()
  regenerateTwoFactorRecoveryCodesRequestMock.mockReset()
  setupPlatformRequestMock.mockReset()
  clearStoredAuthMock.mockReset()
  completeBrowserAuthenticationMock.mockReset()
  completeBrowserAuthenticationMock.mockImplementation(async (data) => data)
  getCurrentUserMock.mockReset()
  getCurrentUserMock.mockReturnValue(null)
  restoreBrowserSessionMock.mockReset()
  restoreBrowserSessionMock.mockResolvedValue(null)
  verifyPasskeyAuthenticationRequestMock.mockReset()
  verifyPasskeyRegistrationRequestMock.mockReset()
  verifyTwoFactorLoginRequestMock.mockReset()
  applyLocaleForUserMock.mockReset()
  disconnectSocketMock.mockReset()
  connectSocketMock.mockReset()
  subscribeToSocketAuthenticatedMock.mockReset()
  subscribeToSocketAuthenticatedMock.mockReturnValue(() => {})
  startForegroundChannelTrackingMock.mockReset()
  startForegroundChannelTrackingMock.mockReturnValue(vi.fn())
  startForegroundResumeSyncMock.mockReset()
  startForegroundResumeSyncMock.mockImplementation(() => ({
    requestSync: foregroundResumeRequestSyncMock,
    stop: foregroundResumeStopMock
  }))
  foregroundResumeRequestSyncMock.mockReset()
  foregroundResumeStopMock.mockReset()
  getActiveDesktopProfileMock.mockReset()
  getActiveDesktopProfileMock.mockReturnValue(null)
  updateDesktopProfileSessionMock.mockReset()
  clearDesktopProfileSessionMock.mockReset()
  syncDesktopWorkspaceSessionMock.mockReset()
  signalDesktopWorkspaceLogoutMock.mockReset()
  channelsStoreMock.activeChannelId = null
  channelsStoreMock.channels = []
  channelsStoreMock.hasChannel.mockReset()
  channelsStoreMock.hasChannel.mockReturnValue(false)
  channelsStoreMock.refresh.mockReset()
  channelsStoreMock.refreshChannel.mockReset()
  channelsStoreMock.reset.mockReset()
  dmsStoreMock.hasDmChannel.mockReset()
  dmsStoreMock.hasDmChannel.mockReturnValue(false)
  dmsStoreMock.refresh.mockReset()
  dmsStoreMock.refreshChannel.mockReset()
  dmsStoreMock.reset.mockReset()
  messagesStoreMock.reset.mockReset()
  messagesStoreMock.syncActiveTimelineFromLatest.mockReset()
  messagesStoreMock.clearStoredDrafts.mockReset()
  notificationsStoreMock.syncNotificationState.mockReset()
  notificationsStoreMock.refreshUnreadCounts.mockReset()
  notificationsStoreMock.refreshNotifications.mockReset()
  notificationsStoreMock.reset.mockReset()
  voiceStoreMock.refreshParticipants.mockReset()
  voiceStoreMock.reconnectIfNeeded.mockReset()
  voiceStoreMock.leave.mockReset()
  voiceStoreMock.reset.mockReset()
  uiStoreMock.reset.mockReset()
  meetingsStoreMock.refresh.mockReset()
  meetingsStoreMock.reset.mockReset()
  voiceStoreMock.channelId = null
}

describe('session store api actions', () => {
  beforeEach(() => {
    resetMocks()
  })

  it('login delegates to api helper and sets user', async () => {
    const store = useSessionStore()
    loginRequestMock.mockResolvedValue({
      accessToken: 'token',
      user: { id: 'user-1', email: 'admin@example.com' }
    })

    const result = await store.login('admin@example.com', 'secret', { remember: false })

    expect(loginRequestMock).toHaveBeenCalledWith('admin@example.com', 'secret', { remember: false })
    expect(store.user).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    expect(result).toEqual({
      accessToken: 'token',
      user: { id: 'user-1', email: 'admin@example.com' }
    })
  })

  it('login keeps auth state untouched when the backend requires a second factor', async () => {
    const store = useSessionStore()
    loginRequestMock.mockResolvedValue({
      requiresTwoFactor: true,
      challengeId: 'challenge-1',
      remember: true
    })

    const result = await store.login('admin@example.com', 'secret', { remember: true })

    expect(loginRequestMock).toHaveBeenCalledWith('admin@example.com', 'secret', { remember: true })
    expect(store.user).toBe(null)
    expect(result).toEqual({
      requiresTwoFactor: true,
      challengeId: 'challenge-1',
      remember: true
    })
  })

  it('verifyTwoFactorLogin delegates to api helper and sets user', async () => {
    const store = useSessionStore()
    verifyTwoFactorLoginRequestMock.mockResolvedValue({
      accessToken: 'token',
      user: { id: 'user-2', email: 'admin@example.com' }
    })

    const result = await store.verifyTwoFactorLogin({
      challengeId: 'challenge-1',
      method: 'totp',
      code: '123456',
      remember: true
    })

    expect(verifyTwoFactorLoginRequestMock).toHaveBeenCalledWith({
      challengeId: 'challenge-1',
      method: 'totp',
      code: '123456',
      remember: true
    }, {})
    expect(store.user).toEqual({
      id: 'user-2',
      email: 'admin@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    expect(result).toEqual({
      accessToken: 'token',
      user: { id: 'user-2', email: 'admin@example.com' }
    })
  })

  it('passkey login helpers delegate to api helpers and set user on completion', async () => {
    const store = useSessionStore()
    beginPasskeyAuthenticationRequestMock.mockResolvedValue({
      challengeId: 'passkey-challenge-1',
      options: { challenge: 'abc' }
    })
    verifyPasskeyAuthenticationRequestMock.mockResolvedValue({
      accessToken: 'passkey-token',
      user: { id: 'user-passkey', email: 'passkey@example.com' }
    })

    await expect(store.beginPasskeyAuthentication({ remember: false })).resolves.toEqual({
      challengeId: 'passkey-challenge-1',
      options: { challenge: 'abc' }
    })

    const result = await store.verifyPasskeyAuthentication({
      challengeId: 'passkey-challenge-1',
      authenticationResponse: { id: 'credential-1' },
      remember: false
    })

    expect(verifyPasskeyAuthenticationRequestMock).toHaveBeenCalledWith({
      challengeId: 'passkey-challenge-1',
      authenticationResponse: { id: 'credential-1' },
      remember: false
    }, {})
    expect(store.user).toEqual({
      id: 'user-passkey',
      email: 'passkey@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    expect(result).toEqual({
      accessToken: 'passkey-token',
      user: { id: 'user-passkey', email: 'passkey@example.com' }
    })
  })

  it('init attempts a browser-session restore before treating the user as logged out', async () => {
    const store = useSessionStore()
    restoreBrowserSessionMock.mockImplementation(async () => {
      getCurrentUserMock.mockReturnValue({ id: 'user-restored', email: 'restored@example.com' })
      return {
        accessToken: 'restored-token',
        user: { id: 'user-restored', email: 'restored@example.com' }
      }
    })
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: [], roles: [] } }
      }
      if (url === '/presence') {
        return { data: { online: [] } }
      }
      if (url === '/users') {
        return {
          data: {
            data: [{ id: 'user-restored', email: 'restored@example.com' }]
          }
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await store.init()

    expect(restoreBrowserSessionMock).toHaveBeenCalledTimes(1)
    expect(store.user).toEqual({
      id: 'user-restored',
      email: 'restored@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    await store.destroy()
  })

  it('setupPlatform delegates to api helper', async () => {
    const store = useSessionStore()
    setupPlatformRequestMock.mockResolvedValue({ initialized: true })

    const payload = {
      platformName: 'Nebulynk',
      displayName: 'Admin',
      email: 'admin@example.com',
      password: 'secret'
    }
    const result = await store.setupPlatform(payload)

    expect(setupPlatformRequestMock).toHaveBeenCalledWith(payload)
    expect(result).toEqual({ initialized: true })
  })

  it('changePassword delegates to the dedicated api helper', async () => {
    const store = useSessionStore()
    const payload = {
      currentPassword: 'CurrentPassw0rd!',
      newPassword: 'NextPassw0rd!'
    }
    changePasswordRequestMock.mockResolvedValue({ ok: true })

    const result = await store.changePassword(payload)

    expect(changePasswordRequestMock).toHaveBeenCalledWith(payload)
    expect(result).toEqual({ ok: true })
  })

  it('2FA account-security helpers delegate to the dedicated api helpers', async () => {
    const store = useSessionStore()
    beginTwoFactorSetupRequestMock.mockResolvedValue({ pendingSetup: true })
    confirmTwoFactorSetupRequestMock.mockResolvedValue({ enabled: true })
    regenerateTwoFactorRecoveryCodesRequestMock.mockResolvedValue({ recoveryCodes: ['ABCD-EFGH-IJKL'] })
    disableTwoFactorRequestMock.mockResolvedValue({ ok: true })
    getTwoFactorStatusRequestMock.mockResolvedValue({ enabled: false, pendingSetup: false })

    await expect(store.getTwoFactorStatus()).resolves.toEqual({ enabled: false, pendingSetup: false })
    await expect(store.beginTwoFactorSetup()).resolves.toEqual({ pendingSetup: true })
    await expect(store.confirmTwoFactorSetup({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ enabled: true })
    await expect(store.regenerateTwoFactorRecoveryCodes({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ recoveryCodes: ['ABCD-EFGH-IJKL'] })
    await expect(store.disableTwoFactor({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ ok: true })
  })

  it('passkey account-security helpers delegate to the dedicated api helpers', async () => {
    const store = useSessionStore()
    getPasskeysRequestMock.mockResolvedValue({ passkeys: [{ id: 'passkey-1' }] })
    beginPasskeyRegistrationRequestMock.mockResolvedValue({ challengeId: 'challenge-1', options: {} })
    verifyPasskeyRegistrationRequestMock.mockResolvedValue({ passkey: { id: 'passkey-1' } })
    deletePasskeyRequestMock.mockResolvedValue({ ok: true })

    await expect(store.getPasskeys()).resolves.toEqual({ passkeys: [{ id: 'passkey-1' }] })
    await expect(store.beginPasskeyRegistration({
      currentPassword: 'CurrentPassw0rd!'
    })).resolves.toEqual({ challengeId: 'challenge-1', options: {} })
    await expect(store.verifyPasskeyRegistration({
      challengeId: 'challenge-1',
      registrationResponse: { id: 'credential-1' },
      name: 'Laptop'
    })).resolves.toEqual({ passkey: { id: 'passkey-1' } })
    await expect(store.deletePasskey('passkey-1', {
      currentPassword: 'CurrentPassw0rd!'
    })).resolves.toEqual({ ok: true })
  })

  it('init refreshes meetings before voice reconnect for meeting metadata consistency', async () => {
    const callOrder = []

    getCurrentUserMock.mockReturnValue({ id: 'user-self', is_admin: false })
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: [], roles: [] } }
      }
      if (url === '/presence') {
        return { data: { online: [] } }
      }
      if (url === '/users') {
        return {
          data: {
            data: [{ id: 'user-self', is_admin: false }]
          }
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    channelsStoreMock.refresh.mockImplementation(async () => {
      callOrder.push('channels.refresh')
    })
    dmsStoreMock.refresh.mockImplementation(async () => {
      callOrder.push('dms.refresh')
    })
    notificationsStoreMock.syncNotificationState.mockImplementation(() => {
      callOrder.push('notifications.sync')
    })
    notificationsStoreMock.refreshUnreadCounts.mockImplementation(async () => {
      callOrder.push('notifications.refreshUnreadCounts')
    })
    notificationsStoreMock.refreshNotifications.mockImplementation(async () => {
      callOrder.push('notifications.refreshNotifications')
    })
    voiceStoreMock.refreshParticipants.mockImplementation(async () => {
      callOrder.push('voice.refreshParticipants')
    })
    meetingsStoreMock.refresh.mockImplementation(async () => {
      callOrder.push('meetings.refresh')
    })
    voiceStoreMock.reconnectIfNeeded.mockImplementation(async () => {
      callOrder.push('voice.reconnectIfNeeded')
    })

    const store = useSessionStore()
    await store.init()

    const meetingsRefreshIndex = callOrder.indexOf('meetings.refresh')
    const voiceReconnectIndex = callOrder.indexOf('voice.reconnectIfNeeded')

    expect(meetingsRefreshIndex).toBeGreaterThan(-1)
    expect(voiceReconnectIndex).toBeGreaterThan(meetingsRefreshIndex)

    await store.destroy()
  })

  it('init does not run a second archived-inclusive channel refresh for manage_channels users', async () => {
    getCurrentUserMock.mockReturnValue({ id: 'user-self', is_admin: false })
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: ['manage_channels'], roles: [] } }
      }
      if (url === '/presence') {
        return { data: { online: [] } }
      }
      if (url === '/users') {
        return {
          data: {
            data: [{ id: 'user-self', is_admin: false }]
          }
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const store = useSessionStore()
    await store.init()

    expect(channelsStoreMock.refresh).toHaveBeenCalledTimes(1)
    expect(channelsStoreMock.refresh).toHaveBeenCalledWith()

    await store.destroy()
  })

  it('logout runs destroy cleanup and auth cleanup', async () => {
    const store = useSessionStore()
    store.user = { id: 'user-1' }
    logoutRequestMock.mockResolvedValue(undefined)

    await store.logout()

    expect(messagesStoreMock.clearStoredDrafts).toHaveBeenCalledTimes(1)
    expect(disconnectSocketMock).toHaveBeenCalledTimes(1)
    expect(channelsStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(dmsStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(messagesStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(notificationsStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(voiceStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(uiStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(meetingsStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(logoutRequestMock).toHaveBeenCalledTimes(1)
    expect(store.user).toBe(null)
  })

  it('clearLocalAuthentication destroys state and clears in-memory auth', async () => {
    const store = useSessionStore()
    store.user = { id: 'user-1' }

    await store.clearLocalAuthentication()

    expect(clearStoredAuthMock).toHaveBeenCalledTimes(1)
    expect(disconnectSocketMock).toHaveBeenCalledTimes(1)
    expect(channelsStoreMock.reset).toHaveBeenCalledTimes(1)
    expect(store.user).toBe(null)
  })

  it('init does not bulk-load the users directory anymore', async () => {
    getCurrentUserMock.mockReturnValue({ id: 'user-self', is_admin: false })
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: [], roles: [] } }
      }
      if (url === '/presence') {
        return { data: { online: [] } }
      }
      if (url === '/users') {
        return {
          data: {
            data: [{ id: 'user-self', is_admin: false }]
          }
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const store = useSessionStore()
    await store.init()

    expect(apiMock.get).not.toHaveBeenCalledWith('/users', {
      params: {
        $limit: 30
      }
    })
    expect(apiMock.get).toHaveBeenCalledWith('/users', {
      params: {
        ids: ['user-self'],
        $limit: 1
      }
    })

    await store.destroy()
  })

  it('applyUserPatch upserts unknown users into the local cache', () => {
    const store = useSessionStore()

    store.applyUserPatch({
      id: 'user-9',
      display_name: 'Hydrated User',
      status: 'away'
    })

    expect(store.getUserById('user-9')).toEqual({
      id: 'user-9',
      display_name: 'Hydrated User',
      status: 'away',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    expect(store.allUsers[0].id).toBe('user-9')
  })

  it('updateMeetingVideoPreferences merges and persists meeting video settings', async () => {
    const store = useSessionStore()
    store.user = {
      id: 'user-1',
      display_name: 'Alex',
      meeting_video_preferences: {
        background_mode: 'none',
 preferred_camera_device_id: null,
 video_mirror: true
      }
    }
    apiMock.patch.mockResolvedValue({
      data: {
        id: 'user-1',
        meeting_video_preferences: {
          background_mode: 'blur',
 preferred_camera_device_id: 'camera-front',
 video_mirror: true
        }
      }
    })

    await store.updateMeetingVideoPreferences({
      background_mode: 'blur',
      preferred_camera_device_id: 'camera-front'
    })

    expect(apiMock.patch).toHaveBeenCalledWith('/users/user-1', {
    meeting_video_preferences: {
      background_mode: 'blur',
 preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: true
    }
  })
  expect(store.user.meeting_video_preferences).toEqual({
    background_mode: 'blur',
 preferred_camera_device_id: 'camera-front',
 background_image_id: null,
 video_mirror: true
  })
  })

  it('primeUsers keeps existing fields when a partial payload omits status', () => {
    const store = useSessionStore()

    store.primeUsers([{
      id: 'user-1',
      display_name: 'Alex',
      status: 'online'
    }])

    store.primeUsers([{
      id: 'user-1',
      display_name: 'Alex Renamed',
      status: undefined
    }])

    expect(store.getUserById('user-1')).toEqual({
      id: 'user-1',
      display_name: 'Alex Renamed',
      status: 'online',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('uploadOwnAvatar posts multipart data to the avatar endpoint and updates the cached user', async () => {
    const store = useSessionStore()
    store.user = { id: 'user-1', display_name: 'Alex' }
    const file = new File(['avatar'], 'avatar.webp', { type: 'image/webp' })

    apiMock.post.mockImplementation(async (url, formData, config) => {
      expect(url).toBe('/users/me/avatar')
      expect(formData).toBeInstanceOf(FormData)
      expect(formData.get('file')).toBe(file)
      expect(config.headers).toEqual({
        'Content-Type': 'multipart/form-data'
      })
      return {
        data: {
          id: 'user-1',
          avatar_url: '/api/users/user-1/avatar?v=1'
        }
      }
    })

    const result = await store.uploadOwnAvatar(file)

    expect(result).toEqual({
      id: 'user-1',
      avatar_url: '/api/users/user-1/avatar?v=1'
    })
    expect(store.user.avatar_url).toBe('/api/users/user-1/avatar?v=1')
  })

  it('ensureUsersByIds forwards an optional channel scope for guest-safe hydration', async () => {
    const store = useSessionStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: [{
          id: 'user-2',
          display_name: 'Scoped User'
        }]
      }
    })

    const result = await store.ensureUsersByIds(['user-2'], { channelId: 'meeting-channel-1' })

    expect(apiMock.get).toHaveBeenCalledWith('/users', {
      params: {
        ids: ['user-2'],
        channel_id: 'meeting-channel-1',
        $limit: 1
      }
    })
    expect(result).toEqual([{
      id: 'user-2',
      display_name: 'Scoped User',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
  })

  it('self hydration does not seed the default directory list and a later load still fetches it', async () => {
    const store = useSessionStore()

    store.primeUsers([
      {
        id: 'member-self',
        display_name: 'Self User',
        account_type: 'member'
      }
    ])

    expect(store.getDefaultDirectoryUsers()).toEqual([])

    apiMock.get.mockResolvedValue({
      data: {
        data: [{
          id: 'member-1',
          display_name: 'Member One',
          account_type: 'member'
        }]
      }
    })

    const result = await store.ensureDirectoryUsersLoaded({ limit: 20 })

    expect(apiMock.get).toHaveBeenCalledWith('/users', {
      params: {
        $limit: 20
      }
    })
    expect(result).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
  })

  it('guest-only scoped hydration does not alter the default directory list', async () => {
    const store = useSessionStore()
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{
          id: 'member-1',
          display_name: 'Member One',
          account_type: 'member'
        }]
      }
    })

    await store.ensureDirectoryUsersLoaded({ limit: 20 })

    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{
          id: 'guest-2',
          display_name: 'Scoped Guest',
          account_type: 'guest'
        }]
      }
    })

    await store.ensureUsersByIds(['guest-2'], { channelId: 'meeting-channel-1' })

    expect(store.getDefaultDirectoryUsers()).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
    expect(store.getDirectoryUsersByIds(['member-1', 'guest-2'])).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
  })

  it('ensureDirectoryUsersLoaded hydrates and caches member-only picker defaults', async () => {
    const store = useSessionStore()
    apiMock.get.mockResolvedValue({
      data: {
        data: [
          { id: 'member-1', display_name: 'Member One', account_type: 'member' },
          { id: 'guest-1', display_name: 'Guest One', account_type: 'guest' }
        ]
      }
    })

    const result = await store.ensureDirectoryUsersLoaded({ limit: 30 })

    expect(apiMock.get).toHaveBeenCalledWith('/users', {
      params: {
        $limit: 30
      }
    })
    expect(result).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
    expect(store.getDefaultDirectoryUsers(30)).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])

    apiMock.get.mockClear()

    const cachedResult = await store.ensureDirectoryUsersLoaded({ limit: 20 })

    expect(apiMock.get).not.toHaveBeenCalled()
    expect(cachedResult).toEqual([{
      id: 'member-1',
      display_name: 'Member One',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    }])
  })

  it('searchUsers hydrates matches without replacing the default directory list', async () => {
    const store = useSessionStore()
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'member-1', display_name: 'Alice', account_type: 'member' },
          { id: 'member-2', display_name: 'Bob', account_type: 'member' }
        ]
      }
    })

    await store.ensureDirectoryUsersLoaded({ limit: 20 })

    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'member-9', display_name: 'Admin', account_type: 'member' }
        ]
      }
    })

    const result = await store.searchUsers('Ad', { limit: 20 })

    expect(result).toEqual([{
      id: 'member-9',
      display_name: 'Admin',
      account_type: 'member'
    }])
    expect(store.getUserById('member-9')).toEqual({
      id: 'member-9',
      display_name: 'Admin',
      account_type: 'member',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
    expect(store.getDefaultDirectoryUsers()).toEqual([
      {
        id: 'member-1',
        display_name: 'Alice',
        account_type: 'member',
        meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
      },
      {
        id: 'member-2',
        display_name: 'Bob',
        account_type: 'member',
        meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
      }
    ])
  })

  it('removeOwnAvatar clears the cached user avatar via the avatar endpoint', async () => {
    const store = useSessionStore()
    store.user = {
      id: 'user-1',
      display_name: 'Alex',
      avatar_url: '/api/users/user-1/avatar?v=1'
    }

    apiMock.delete.mockResolvedValue({
      data: {
        id: 'user-1',
        avatar_url: null
      }
    })

    const result = await store.removeOwnAvatar()

    expect(apiMock.delete).toHaveBeenCalledWith('/users/me/avatar')
    expect(result).toEqual({
      id: 'user-1',
      avatar_url: null
    })
    expect(store.user.avatar_url).toBe(null)
  })

  it('refreshPresence rehydrates cached online users and clears pending sync once self is online', async () => {
    const store = useSessionStore()
    store.user = { id: 'user-self', status: 'offline' }
    store.primeUsers([
      { id: 'user-self', status: 'offline' },
      { id: 'user-2', status: 'offline', display_name: 'User Two' }
    ])
    store.presenceSyncPending = true

    apiMock.get.mockImplementation(async (url, config) => {
      if (url === '/presence') {
        return {
          data: {
            online: ['user-self', 'user-2']
          }
        }
      }

      if (url === '/users') {
        expect(config).toEqual({
          params: {
            ids: ['user-self', 'user-2'],
            $limit: 2
          }
        })
        return {
          data: {
            data: [
              { id: 'user-self', status: 'online' },
              { id: 'user-2', status: 'away', display_name: 'User Two' }
            ]
          }
        }
      }

      throw new Error(`Unexpected GET ${url}`)
    })

    await store.refreshPresence()

    expect(store.onlineUserIds).toEqual(['user-self', 'user-2'])
    expect(store.presenceLoaded).toBe(true)
    expect(store.presenceSyncPending).toBe(false)
    expect(store.lastPresenceRefreshAt).toMatch(/T/)
    expect(store.getUserById('user-self')?.status).toBe('online')
    expect(store.getUserById('user-2')?.status).toBe('away')
  })

  it('keeps self presence pending until the live presence list includes the current user', async () => {
    const store = useSessionStore()
    store.user = { id: 'user-self', status: 'offline' }
    store.primeUsers([
      { id: 'user-self', status: 'offline' },
      { id: 'user-2', status: 'offline', display_name: 'User Two' }
    ])
    store.presenceSyncPending = true

    apiMock.get.mockImplementation(async (url) => {
      if (url === '/presence') {
        return {
          data: {
            online: ['user-2']
          }
        }
      }

      if (url === '/users') {
        return {
          data: {
            data: [
              { id: 'user-self', status: 'offline' },
              { id: 'user-2', status: 'online', display_name: 'User Two' }
            ]
          }
        }
      }

      throw new Error(`Unexpected GET ${url}`)
    })

    await store.refreshPresence()

    expect(store.presenceSyncPending).toBe(true)
    expect(store.resolveUserPresence(store.user)).toEqual({
      isConnected: true,
      displayStatus: 'online',
      badgeStatus: 'default',
      isPendingSync: true
    })
  })

  it('persists self user patches back into the active desktop profile session', async () => {
    const store = useSessionStore()
    getActiveDesktopProfileMock.mockReturnValue({
      id: 'desktop-profile-1',
      authState: {
        accessToken: 'token',
        csrfToken: null,
        refreshToken: 'refresh-token',
        sessionTransport: 'body',
        user: { id: 'user-self', status: 'offline' }
      }
    })
    store.user = { id: 'user-self', status: 'offline' }
    store.primeUsers([{ id: 'user-self', status: 'offline' }])

    store.applyUserPatch({
      id: 'user-self',
      status: 'away'
    })

    await Promise.resolve()

    expect(updateDesktopProfileSessionMock).toHaveBeenCalledWith('desktop-profile-1', {
      accessToken: 'token',
      csrfToken: null,
      refreshToken: 'refresh-token',
      sessionTransport: 'body',
      user: {
        id: 'user-self',
        status: 'away',
        meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
      }
    })
  })

  it('re-runs presence sync after socket authentication and hydrates freshly online users', async () => {
    let authenticatedHandler = null
    const socket = {}

    connectSocketMock.mockReturnValue(socket)
    subscribeToSocketAuthenticatedMock.mockImplementation((handler) => {
      authenticatedHandler = handler
      return () => {
        authenticatedHandler = null
      }
    })
    getCurrentUserMock.mockReturnValue({
      id: 'user-self',
      status: 'offline'
    })

    const presenceResponses = [
      { data: { online: [] } },
      { data: { online: ['user-self', 'user-2'] } }
    ]
    const userResponses = [
      { data: { data: [{ id: 'user-self', status: 'offline' }] } },
      {
        data: {
          data: [
            { id: 'user-self', status: 'online' },
            { id: 'user-2', status: 'away', display_name: 'User Two' }
          ]
        }
      }
    ]

    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: [], roles: [] } }
      }
      if (url === '/presence') {
        return presenceResponses.shift()
      }
      if (url === '/users') {
        return userResponses.shift()
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const store = useSessionStore()
    await store.destroy()
    await store.init()
    voiceStoreMock.reconnectIfNeeded.mockClear()

    expect(store.presenceSyncPending).toBe(true)
    expect(store.onlineUserIds).toEqual([])

    await authenticatedHandler(socket)

    expect(store.presenceSyncPending).toBe(false)
    expect(store.onlineUserIds).toEqual(['user-self', 'user-2'])
    expect(store.getUserById('user-self')?.status).toBe('online')
    expect(store.getUserById('user-2')?.status).toBe('away')
    expect(voiceStoreMock.reconnectIfNeeded).toHaveBeenCalledTimes(1)
    expect(foregroundResumeRequestSyncMock).toHaveBeenCalledWith('socket-authenticated', {
      immediate: true,
      requireVisibleChat: true
    })

    await store.destroy()
  })

  it('syncForegroundResumeState refreshes active text channel metadata and visible latest timeline catch-up', async () => {
    const store = useSessionStore()
    store.permissions = []
    channelsStoreMock.activeChannelId = 'channel-1'
    channelsStoreMock.hasChannel.mockReturnValue(true)

    await store.syncForegroundResumeState({ includeVisibleChat: true })

    expect(channelsStoreMock.refresh).toHaveBeenCalledWith()
    expect(dmsStoreMock.refresh).toHaveBeenCalledWith()
    expect(dmsStoreMock.refresh).toHaveBeenCalledTimes(1)
    expect(notificationsStoreMock.refreshUnreadCounts).toHaveBeenCalledWith()
    expect(notificationsStoreMock.refreshUnreadCounts).toHaveBeenCalledTimes(1)
    expect(notificationsStoreMock.refreshNotifications).toHaveBeenCalledTimes(1)
    expect(channelsStoreMock.refreshChannel).toHaveBeenCalledWith('channel-1')
    expect(dmsStoreMock.refreshChannel).not.toHaveBeenCalled()
    expect(messagesStoreMock.syncActiveTimelineFromLatest).toHaveBeenCalledTimes(1)
  })

  it('syncForegroundResumeState skips metadata refresh for archived meeting history', async () => {
    const store = useSessionStore()
    channelsStoreMock.activeChannelId = 'meeting-channel-1'
    channelsStoreMock.channels = [{
      id: 'meeting-channel-1',
      purpose: 'meeting',
      is_archived: true
    }]
    channelsStoreMock.hasChannel.mockReturnValue(true)

    await store.syncForegroundResumeState()

    expect(channelsStoreMock.refreshChannel).not.toHaveBeenCalled()
  })

  it('syncForegroundResumeState refreshes active DM metadata without forcing timeline catch-up', async () => {
    const store = useSessionStore()
    store.permissions = ['manage_channels']
    channelsStoreMock.activeChannelId = 'dm-1'
    dmsStoreMock.hasDmChannel.mockReturnValue(true)

    await store.syncForegroundResumeState({ includeVisibleChat: false })

    expect(channelsStoreMock.refresh).toHaveBeenCalledWith()
    expect(dmsStoreMock.refresh).toHaveBeenCalledWith()
    expect(dmsStoreMock.refreshChannel).toHaveBeenCalledWith('dm-1')
    expect(channelsStoreMock.refreshChannel).not.toHaveBeenCalled()
    expect(messagesStoreMock.syncActiveTimelineFromLatest).not.toHaveBeenCalled()
  })

  it('syncForegroundResumeState forces unread counts after socket-authenticated resume reasons', async () => {
    const store = useSessionStore()

    await store.syncForegroundResumeState({ reason: 'socket-authenticated' })

    expect(dmsStoreMock.refresh).toHaveBeenCalledWith({ force: true })
    expect(notificationsStoreMock.refreshUnreadCounts).toHaveBeenCalledWith({ force: true })
  })

  it('init forces unread-count refresh during bootstrap reconciliation', async () => {
    getCurrentUserMock.mockReturnValue({ id: 'user-self', is_admin: false })
    apiMock.get.mockImplementation(async (url) => {
      if (url === '/my-permissions') {
        return { data: { permissions: [], roles: [] } }
      }
      if (url === '/presence') {
        return { data: { online: [] } }
      }
      if (url === '/users') {
        return {
          data: {
            data: [{ id: 'user-self', is_admin: false }]
          }
        }
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    const store = useSessionStore()
    await store.init()

    expect(dmsStoreMock.refresh).toHaveBeenCalledWith({ force: true })
    expect(notificationsStoreMock.refreshUnreadCounts).toHaveBeenCalledWith({ force: true })

    await store.destroy()
  })
})
