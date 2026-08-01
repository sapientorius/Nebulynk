import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupRealtimeListeners } from '../../src/stores/realtime.js'

const sfxMock = vi.hoisted(() => ({
  playSfx: vi.fn(),
  SFX_EVENTS: {
    NOTIFICATION: 'notification',
    VOICE_JOIN_OTHER: 'voice_join_other',
    VOICE_LEAVE_OTHER: 'voice_leave_other',
    CALL_INCOMING: 'call_incoming'
  }
}))

const showDesktopNotificationMock = vi.hoisted(() => vi.fn())
const isAppForegroundVisibleMock = vi.hoisted(() => vi.fn())
const getDesktopWorkspaceNotificationStateMock = vi.hoisted(() => vi.fn())
const getDesktopWorkspaceProfileContextMock = vi.hoisted(() => vi.fn())
const isDesktopDiagnosticsEnabledMock = vi.hoisted(() => vi.fn())
const isElectronDesktopRuntimeMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/sfx.js', () => sfxMock)

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  showDesktopNotification: showDesktopNotificationMock
}))

vi.mock('../../src/lib/desktop-window-state.js', () => ({
  isAppForegroundVisible: isAppForegroundVisibleMock
}))

vi.mock('../../src/lib/desktop-workspace-bridge.js', () => ({
  getDesktopWorkspaceNotificationState: getDesktopWorkspaceNotificationStateMock,
  getDesktopWorkspaceProfileContext: getDesktopWorkspaceProfileContextMock
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopDiagnosticsEnabled: isDesktopDiagnosticsEnabledMock,
  isElectronDesktopRuntime: isElectronDesktopRuntimeMock
}))

function createSocketHarness() {
  const handlers = new Map()
  return {
    socket: {
      on: vi.fn((eventName, handler) => {
        handlers.set(eventName, handler)
      })
    },
    emit(eventName, payload) {
      const handler = handlers.get(eventName)
      if (!handler) throw new Error(`Missing socket handler: ${eventName}`)
      handler(payload)
    }
  }
}

function createStoreMocks() {
  const sessionStore = {
    user: { id: 'user-self', status: 'online' },
    hasPermission: vi.fn(() => false),
    refreshPermissions: vi.fn().mockResolvedValue(undefined),
    addOnlineUserId: vi.fn(),
    removeOnlineUserId: vi.fn(),
    reconcilePresenceUsers: vi.fn().mockResolvedValue([]),
    clearStatusForUser: vi.fn(),
    applyUserPatch: vi.fn(),
    applyInviteCreated: vi.fn(),
    applyInvitePatched: vi.fn()
  }

  const channelsStore = {
    activeChannelId: 'channel-active',
    hasChannel: vi.fn(() => true),
    isChannelInReadViewport: vi.fn(() => true),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshChannel: vi.fn().mockResolvedValue(undefined),
    refreshMembers: vi.fn().mockResolvedValue(undefined),
    incrementUnread: vi.fn(),
    clearUnread: vi.fn(),
    addChannel: vi.fn(),
    patchChannel: vi.fn(),
    removeChannel: vi.fn(),
    clearActiveContext: vi.fn()
  }

  const dmsStore = {
    dmChannels: [],
    bumpChannelByMessage: vi.fn(),
    hasDmChannel: vi.fn(() => false),
    refreshChannel: vi.fn().mockResolvedValue(undefined),
    patchChannel: vi.fn(),
    removeChannel: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined)
  }

  const messagesStore = {
    addMessageIfMissing: vi.fn(),
    replaceMessage: vi.fn(),
    removeMessage: vi.fn(),
    applyReactionCreated: vi.fn(),
    applyReactionRemoved: vi.fn(),
    addPin: vi.fn(),
    removePin: vi.fn()
  }

  const notificationsStore = {
    notifications: [],
    ingestIncomingNotification: vi.fn((notification) => {
      notificationsStore.notifications.push(notification)
    })
  }

  const voiceStore = {
    channelId: 'voice-active',
    participants: {},
    addParticipant: vi.fn(),
    removeParticipant: vi.fn(),
    updateParticipant: vi.fn()
  }

  const meetingsStore = {
    meetings: [],
    hasMeetingChatChannel: vi.fn(() => false),
    refresh: vi.fn().mockResolvedValue(undefined),
    handleMeetingCreated: vi.fn(),
    handleMeetingInvited: vi.fn(),
    handleMeetingJoined: vi.fn(),
    handleMeetingEnded: vi.fn(),
    handleArtifactsQueued: vi.fn(),
    handleArtifactsUpdated: vi.fn(),
    handleRecordingStateUpdated: vi.fn()
  }

  const messageSummariesStore = {
    applyRealtimeSummary: vi.fn(),
    applyRealtimeSummaryRemoved: vi.fn()
  }

  return {
    sessionStore,
    channelsStore,
    dmsStore,
    messagesStore,
    notificationsStore,
    voiceStore,
    meetingsStore,
    messageSummariesStore
  }
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('realtime socket contract', () => {
  beforeEach(() => {
    sfxMock.playSfx.mockReset()
    showDesktopNotificationMock.mockReset()
    showDesktopNotificationMock.mockResolvedValue(true)
    isAppForegroundVisibleMock.mockReset()
    isAppForegroundVisibleMock.mockReturnValue(false)
    getDesktopWorkspaceNotificationStateMock.mockReset()
    getDesktopWorkspaceNotificationStateMock.mockReturnValue({
      enabled: true,
      permission: 'granted'
    })
    getDesktopWorkspaceProfileContextMock.mockReset()
    getDesktopWorkspaceProfileContextMock.mockReturnValue({
      profileId: 'profile-electron-1',
      baseUrl: 'https://chat.example.com',
      route: '/channels'
    })
    isDesktopDiagnosticsEnabledMock.mockReset()
    isDesktopDiagnosticsEnabledMock.mockReturnValue(false)
    isElectronDesktopRuntimeMock.mockReset()
    isElectronDesktopRuntimeMock.mockReturnValue(false)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps messages events to message and channel stores', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('messages created', {
      id: 'message-1',
      channel_id: 'channel-active',
      created_at: '2026-03-09T09:00:00.000Z'
    })
    emit('messages patched', { id: 'message-1', content: 'edited' })
    emit('messages removed', { id: 'message-1' })

    expect(stores.messagesStore.addMessageIfMissing).toHaveBeenCalledWith(expect.objectContaining({ id: 'message-1' }))
    expect(stores.channelsStore.clearUnread).toHaveBeenCalledWith('channel-active')
    expect(stores.channelsStore.incrementUnread).not.toHaveBeenCalled()
    expect(stores.messagesStore.replaceMessage).toHaveBeenCalledWith({ id: 'message-1', content: 'edited' })
    expect(stores.messagesStore.removeMessage).toHaveBeenCalledWith('message-1')
  })

  it('keeps hydrated message fields when socket patch events only send edited fields', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    const liveMessage = {
      id: 'message-1',
      content: 'before',
      user_display_name: 'User One',
      files: [{ id: 'file-1', original_name: 'image.png' }]
    }

    stores.messagesStore.replaceMessage = vi.fn((patch) => {
      Object.assign(liveMessage, patch)
    })

    setupRealtimeListeners(socket, stores)
    emit('messages patched', {
      id: 'message-1',
      content: 'after',
      edited_at: '2026-03-19T10:00:00.000Z'
    })

    expect(stores.messagesStore.replaceMessage).toHaveBeenCalledWith({
      id: 'message-1',
      content: 'after',
      edited_at: '2026-03-19T10:00:00.000Z'
    })
    expect(liveMessage).toEqual({
      id: 'message-1',
      content: 'after',
      edited_at: '2026-03-19T10:00:00.000Z',
      user_display_name: 'User One',
      files: [{ id: 'file-1', original_name: 'image.png' }]
    })
  })

  it('keeps active-channel messages unread while the user is scrolled up', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.isChannelInReadViewport.mockReturnValue(false)

    setupRealtimeListeners(socket, stores)
    emit('messages created', {
      id: 'message-3',
      channel_id: 'channel-active',
      user_id: 'user-other',
      created_at: '2026-03-09T10:00:00.000Z'
    })

    expect(stores.channelsStore.incrementUnread).toHaveBeenCalledWith('channel-active')
    expect(stores.channelsStore.clearUnread).not.toHaveBeenCalled()
  })

  it('increments unread for inactive channels and refreshes DMs for unknown channels', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-active'
    stores.channelsStore.hasChannel.mockReturnValue(false)

    setupRealtimeListeners(socket, stores)
    emit('messages created', {
      id: 'message-2',
      channel_id: 'channel-other',
      created_at: '2026-03-09T10:00:00.000Z'
    })

    expect(stores.channelsStore.incrementUnread).toHaveBeenCalledWith('channel-other')
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
  })

  it('debounces DM refresh fallback for unknown message channels', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-active'
    stores.channelsStore.hasChannel.mockReturnValue(false)

    setupRealtimeListeners(socket, stores)
    emit('messages created', {
      id: 'message-2',
      channel_id: 'channel-other',
      created_at: '2026-03-09T10:00:00.000Z'
    })

    await vi.runOnlyPendingTimersAsync()

    expect(stores.dmsStore.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not increment unread for own messages in inactive channels', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-active'

    setupRealtimeListeners(socket, stores)
    emit('messages created', {
      id: 'message-own-forward',
      channel_id: 'channel-other',
      user_id: 'user-self',
      created_at: '2026-03-09T10:00:00.000Z'
    })

    expect(stores.channelsStore.incrementUnread).not.toHaveBeenCalled()
  })

  it('maps voice participant events and prevents duplicate joins', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.voiceStore.participants = {
      'voice-active': [{ user_id: 'user-existing' }]
    }

    setupRealtimeListeners(socket, stores)

    emit('voice participant-joined', {
      channelId: 'voice-active',
      participant: { user_id: 'user-existing' }
    })
    emit('voice participant-joined', {
      channelId: 'voice-active',
      participant: { user_id: 'user-other' }
    })
    emit('voice participant-left', {
      channelId: 'voice-active',
      userId: 'user-existing'
    })
    emit('voice participant-updated', {
      channelId: 'voice-active',
      userId: 'user-other',
      is_muted: true,
      is_deafened: false
    })

    expect(stores.voiceStore.addParticipant).toHaveBeenCalledTimes(1)
    expect(stores.voiceStore.addParticipant).toHaveBeenCalledWith('voice-active', { user_id: 'user-other' })
    expect(stores.voiceStore.removeParticipant).toHaveBeenCalledWith('voice-active', 'user-existing')
    expect(stores.voiceStore.updateParticipant).toHaveBeenCalledWith('voice-active', 'user-other', {
      is_muted: true,
      is_deafened: false
    })
    expect(sfxMock.playSfx).toHaveBeenCalledWith(sfxMock.SFX_EVENTS.VOICE_JOIN_OTHER)
    expect(sfxMock.playSfx).toHaveBeenCalledWith(sfxMock.SFX_EVENTS.VOICE_LEAVE_OTHER)
  })

  it('ingests notifications from direct and legacy socket events with de-duplication', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-1',
      actor_id: 'user-other'
    })
    emit('notifications created', {
      id: 'notif-1',
      actor_id: 'user-other'
    })
    emit('message', {
      type: 'notifications created',
      data: { id: 'notif-2', actor_id: 'user-self' }
    })

    expect(stores.notificationsStore.ingestIncomingNotification).toHaveBeenCalledTimes(2)
    expect(stores.notificationsStore.ingestIncomingNotification).toHaveBeenNthCalledWith(1, {
      id: 'notif-1',
      actor_id: 'user-other'
    })
    expect(stores.notificationsStore.ingestIncomingNotification).toHaveBeenNthCalledWith(2, {
      id: 'notif-2',
      actor_id: 'user-self'
    })
    expect(sfxMock.playSfx).toHaveBeenCalledTimes(1)
    expect(sfxMock.playSfx).toHaveBeenCalledWith(sfxMock.SFX_EVENTS.NOTIFICATION)
  })

  it('dispatches one native desktop notification for a non-visible active Electron workspace', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.meetingsStore.meetings = [{
      id: 'meeting-1',
      chat_channel_id: 'channel-meeting',
      status: 'active'
    }]
    isElectronDesktopRuntimeMock.mockReturnValue(true)
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-electron-1',
      actor_id: 'user-other',
      actor_display_name: 'Alex Example',
      channel_id: 'channel-meeting',
      message_snippet: 'Ping'
    })
    emit('notifications created', {
      id: 'notif-electron-1',
      actor_id: 'user-other',
      actor_display_name: 'Alex Example',
      channel_id: 'channel-meeting',
      message_snippet: 'Ping'
    })

    await flushAsyncWork()

    expect(showDesktopNotificationMock).toHaveBeenCalledTimes(1)
    expect(showDesktopNotificationMock).toHaveBeenCalledWith({
      title: 'Alex Example',
      body: 'Ping',
      serverId: 'profile-electron-1',
      route: '/meetings/meeting-1'
    })
  })

  it('routes plain channel notifications to the channel view for Electron workspace notifications', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    isElectronDesktopRuntimeMock.mockReturnValue(true)
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-electron-channel',
      actor_id: 'user-other',
      actor_display_name: 'Alex Example',
      channel_id: 'channel-plain',
      message_snippet: 'Channel ping'
    })

    await flushAsyncWork()

    expect(showDesktopNotificationMock).toHaveBeenCalledWith({
      title: 'Alex Example',
      body: 'Channel ping',
      serverId: 'profile-electron-1',
      route: '/channels/channel-plain'
    })
  })

  it('routes Electron workspace meeting invite notifications directly to the meeting view', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    isElectronDesktopRuntimeMock.mockReturnValue(true)
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-electron-meeting',
      actor_id: 'user-other',
      actor_display_name: 'Alex Example',
      type: 'meeting_invite',
      meeting_id: 'meeting-direct',
      channel_id: 'channel-meeting',
      message_snippet: 'Join the meeting'
    })

    await flushAsyncWork()

    expect(showDesktopNotificationMock).toHaveBeenCalledWith({
      title: 'Alex Example',
      body: 'Join the meeting',
      serverId: 'profile-electron-1',
      route: '/meetings/meeting-direct'
    })
  })

  it('does not dispatch native desktop notifications for a visible-but-unfocused Electron workspace', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    isElectronDesktopRuntimeMock.mockReturnValue(true)
    isAppForegroundVisibleMock.mockReturnValue(true)
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-electron-foreground',
      actor_id: 'user-other',
      channel_id: 'channel-foreground'
    })

    await flushAsyncWork()

    expect(showDesktopNotificationMock).not.toHaveBeenCalled()
  })

  it('does not dispatch native desktop notifications when desktop notifications are disabled or blocked', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    isElectronDesktopRuntimeMock.mockReturnValue(true)
    getDesktopWorkspaceNotificationStateMock
      .mockReturnValueOnce({
        enabled: false,
        permission: 'granted'
      })
      .mockReturnValueOnce({
        enabled: true,
        permission: 'default'
      })
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-electron-disabled',
      actor_id: 'user-other',
      channel_id: 'channel-disabled'
    })
    emit('notifications created', {
      id: 'notif-electron-blocked',
      actor_id: 'user-other',
      channel_id: 'channel-blocked'
    })

    await flushAsyncWork()

    expect(showDesktopNotificationMock).not.toHaveBeenCalled()
  })

  it('reconciles live user data when presence online messages arrive before a user patch', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('message', {
      type: 'presence',
      userId: 'user-other',
      status: 'online'
    })

    expect(stores.sessionStore.addOnlineUserId).toHaveBeenCalledWith('user-other')
    expect(stores.sessionStore.reconcilePresenceUsers).toHaveBeenCalledWith(
      ['user-other'],
      { includeUnknown: true }
    )
  })

  it('treats away user patches as connected presence and rehydrates the user cache', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('users patched', {
      id: 'user-away',
      status: 'away'
    })

    expect(stores.sessionStore.applyUserPatch).toHaveBeenCalledWith({
      id: 'user-away',
      status: 'away'
    })
    expect(stores.sessionStore.addOnlineUserId).toHaveBeenCalledWith('user-away')
    expect(stores.sessionStore.reconcilePresenceUsers).toHaveBeenCalledWith(
      ['user-away'],
      { includeUnknown: true }
    )
    expect(stores.sessionStore.removeOnlineUserId).not.toHaveBeenCalled()
  })

  it('keeps incoming notifications visible during dnd without playing notification audio', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.sessionStore.user.status = 'dnd'
    setupRealtimeListeners(socket, stores)

    emit('notifications created', {
      id: 'notif-dnd-1',
      actor_id: 'user-other'
    })

    expect(stores.notificationsStore.ingestIncomingNotification).toHaveBeenCalledTimes(1)
    expect(stores.notificationsStore.ingestIncomingNotification).toHaveBeenCalledWith({
      id: 'notif-dnd-1',
      actor_id: 'user-other'
    })
    expect(sfxMock.playSfx).not.toHaveBeenCalled()
  })

  it('routes meeting lifecycle socket events to meetings store handlers', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('meetings created', { id: 'meeting-1' })
    emit('meetings invited', { meetingId: 'meeting-1', userIds: ['user-self'] })
    emit('meetings joined', {
      meetingId: 'meeting-1',
      userId: 'user-self',
      participantUserId: 'user-self',
      status: 'active'
    })
    emit('meetings ended', {
      meetingId: 'meeting-1',
      status: 'ended',
      chatChannelArchived: true
    })
    emit('meetings artifacts-queued', { meetingId: 'meeting-1' })
    emit('meetings recording-state-updated', { meetingId: 'meeting-1' })

    expect(stores.meetingsStore.handleMeetingCreated).toHaveBeenCalledWith({ id: 'meeting-1' })
    expect(stores.meetingsStore.handleMeetingInvited).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      userIds: ['user-self']
    })
    expect(stores.meetingsStore.handleMeetingJoined).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      userId: 'user-self',
      participantUserId: 'user-self',
      status: 'active'
    })
    expect(stores.meetingsStore.handleMeetingEnded).toHaveBeenCalledWith({
      meetingId: 'meeting-1',
      status: 'ended',
      chatChannelArchived: true
    })
    expect(stores.meetingsStore.handleArtifactsQueued).toHaveBeenCalledWith({ meetingId: 'meeting-1' })
    expect(stores.meetingsStore.handleRecordingStateUpdated).toHaveBeenCalledWith({ meetingId: 'meeting-1' })
  })

  it('handles membership events for current user and refreshes channel/dm lists', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-42'
    setupRealtimeListeners(socket, stores)

    emit('channel-members created', {
      id: 'membership-1',
      channel_id: 'channel-42',
      user_id: 'user-self'
    })
    emit('channel-members removed', {
      id: 'membership-1',
      channel_id: 'channel-42',
      user_id: 'user-self'
    })

    expect(stores.channelsStore.refreshChannel).toHaveBeenCalledWith('channel-42')
    expect(stores.channelsStore.refresh).not.toHaveBeenCalled()
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
    expect(stores.channelsStore.removeChannel).toHaveBeenCalledWith('channel-42')
    expect(stores.dmsStore.removeChannel).toHaveBeenCalledWith('channel-42')
    expect(stores.channelsStore.clearActiveContext).toHaveBeenCalled()
  })

  it('uses targeted DM refresh for DM channel create and patch events', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('channels created', {
      id: 'dm-1',
      type: 'dm'
    })
    emit('channels patched', {
      id: 'dm-1',
      type: 'dm'
    })

    expect(stores.dmsStore.refreshChannel).toHaveBeenCalledTimes(2)
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
  })

  it('does not insert unknown standard channels from public channel create broadcasts', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.hasChannel.mockReturnValue(false)
    setupRealtimeListeners(socket, stores)

    emit('channels created', {
      id: 'channel-public-new',
      type: 'public',
      purpose: 'default',
      name: 'Announcements'
    })

    expect(stores.channelsStore.patchChannel).not.toHaveBeenCalled()
    expect(stores.channelsStore.addChannel).not.toHaveBeenCalled()
    expect(stores.channelsStore.refresh).not.toHaveBeenCalled()
  })

  it('schedules a scoped refresh when targeted self-membership hydration fails', async () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.refreshChannel.mockRejectedValueOnce(new Error('temporary failure'))
    setupRealtimeListeners(socket, stores)

    emit('channel-members created', {
      id: 'membership-fail-1',
      channel_id: 'channel-fail-1',
      user_id: 'user-self'
    })

    await Promise.resolve()
    await vi.runOnlyPendingTimersAsync()

    expect(stores.channelsStore.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes active channel members for non-self membership events', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-active'
    setupRealtimeListeners(socket, stores)

    emit('channel-members created', {
      id: 'membership-2',
      channel_id: 'channel-active',
      user_id: 'user-other'
    })
    emit('channel-members removed', {
      id: 'membership-3',
      channel_id: 'channel-active',
      user_id: 'user-other'
    })

    expect(stores.channelsStore.refreshMembers).toHaveBeenCalledTimes(2)
    expect(stores.channelsStore.refresh).not.toHaveBeenCalled()
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
  })

  it('refreshes known dm channels for non-self membership events', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.dmsStore.hasDmChannel.mockReturnValue(true)
    setupRealtimeListeners(socket, stores)

    emit('channel-members created', {
      id: 'membership-4',
      channel_id: 'dm-group-1',
      user_id: 'user-other'
    })
    emit('channel-members removed', {
      id: 'membership-5',
      channel_id: 'dm-group-1',
      user_id: 'user-other'
    })

    expect(stores.dmsStore.refreshChannel).toHaveBeenCalledTimes(2)
    expect(stores.dmsStore.refreshChannel).toHaveBeenNthCalledWith(1, 'dm-group-1')
    expect(stores.dmsStore.refreshChannel).toHaveBeenNthCalledWith(2, 'dm-group-1')
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
  })

  it('ignores unrelated non-self membership events for non-active non-dm channels', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    stores.channelsStore.activeChannelId = 'channel-active'
    stores.dmsStore.hasDmChannel.mockReturnValue(false)
    setupRealtimeListeners(socket, stores)

    emit('channel-members created', {
      id: 'membership-6',
      channel_id: 'channel-unrelated',
      user_id: 'user-other'
    })

    expect(stores.channelsStore.refreshMembers).not.toHaveBeenCalled()
    expect(stores.dmsStore.refreshChannel).not.toHaveBeenCalled()
    expect(stores.channelsStore.refresh).not.toHaveBeenCalled()
    expect(stores.dmsStore.refresh).not.toHaveBeenCalled()
  })

  it('maps private message summary artifact events to the summary store', () => {
    const { socket, emit } = createSocketHarness()
    const stores = createStoreMocks()
    setupRealtimeListeners(socket, stores)

    emit('message-summaries created', { id: 'summary-1' })
    emit('message-summaries patched', { id: 'summary-1', status: 'ready' })
    emit('message-summaries removed', { id: 'summary-1', status: 'ready' })

    expect(stores.messageSummariesStore.applyRealtimeSummary).toHaveBeenCalledTimes(2)
    expect(stores.messageSummariesStore.applyRealtimeSummaryRemoved).toHaveBeenCalledWith({
      id: 'summary-1',
      status: 'ready'
    })
  })
})
