import { playSfx, SFX_EVENTS } from '../lib/sfx.js'
import { showDesktopNotification } from '../lib/desktop-bridge.js'
import { buildDesktopNotificationRoute } from '../lib/desktop-notification-route.js'
import { isAppForegroundVisible } from '../lib/desktop-window-state.js'
import {
  getDesktopWorkspaceNotificationState,
  getDesktopWorkspaceProfileContext
} from '../lib/desktop-workspace-bridge.js'
import {
  isDesktopDiagnosticsEnabled,
  isElectronDesktopRuntime
} from '../lib/runtime.js'

const REALTIME_REFRESH_DEBOUNCE_MS = 150
const CONNECTED_PRESENCE_STATUSES = new Set(['online', 'away', 'dnd'])

function logDesktopNotificationDiagnostic(message, payload) {
  if (!isDesktopDiagnosticsEnabled()) return
  if (payload === undefined) {
    console.log(message)
    return
  }

  try {
    console.log(`${message} ${JSON.stringify(payload)}`)
  } catch {
    console.log(message)
  }
}

function buildMeetingByChatChannelIdIndex(meetingsStore) {
  const meetings = Array.isArray(meetingsStore?.meetings)
    ? meetingsStore.meetings
    : []
  const meetingByChatChannelId = {}

  for (const meeting of meetings) {
    if (!meeting?.chat_channel_id || !meeting?.id) continue
    meetingByChatChannelId[meeting.chat_channel_id] = meeting.id
  }

  return meetingByChatChannelId
}

export function setupRealtimeListeners(socket, {
  sessionStore,
  channelsStore,
  dmsStore,
  messagesStore,
  notificationsStore,
  voiceStore,
  meetingsStore,
  voiceMessageArtifactsStore,
  messageSummariesStore
}) {
  if (!socket) return

  let channelsRefreshTimerId = null
  let dmsRefreshTimerId = null

  function scheduleChannelsRefresh() {
    if (channelsRefreshTimerId) return

    channelsRefreshTimerId = setTimeout(() => {
      channelsRefreshTimerId = null
      channelsStore.refresh({ force: true }).catch(() => {})
    }, REALTIME_REFRESH_DEBOUNCE_MS)
  }

  function scheduleDmsRefresh() {
    if (dmsRefreshTimerId) return

    dmsRefreshTimerId = setTimeout(() => {
      dmsRefreshTimerId = null
      dmsStore.refresh().catch(() => {})
    }, REALTIME_REFRESH_DEBOUNCE_MS)
  }

  function refreshChannelsScoped() {
    scheduleChannelsRefresh()
  }

  function handleIncomingNotification(notification) {
    if (!notification?.id) return

    logDesktopNotificationDiagnostic('[desktop-notify:incoming]', {
      id: notification.id,
      type: notification.type || null,
      channel_id: notification.channel_id || null,
      meeting_id: notification.meeting_id || null,
      actor_id: notification.actor_id || null
    })

    const exists = notificationsStore.notifications.some((entry) => entry.id === notification.id)
    if (exists) {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'duplicate'
      })
      return
    }

    notificationsStore.ingestIncomingNotification(notification)
    maybeDispatchDesktopNotification(notification).catch((error) => {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'dispatch-error',
        message: error?.message || String(error)
      })
    })
    if (notification.actor_id !== sessionStore.user?.id && sessionStore.user?.status !== 'dnd') {
      playSfx(SFX_EVENTS.NOTIFICATION)
    }
  }

  async function maybeDispatchDesktopNotification(notification) {
    if (!isElectronDesktopRuntime()) return false

    const desktopNotificationState = getDesktopWorkspaceNotificationState()
    if (desktopNotificationState.enabled === false) {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'notifications-disabled'
      })
      return false
    }

    if (desktopNotificationState.permission !== 'granted') {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'permission-not-granted',
        permission: desktopNotificationState.permission
      })
      return false
    }

    if (isAppForegroundVisible()) {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'foreground-visible'
      })
      return false
    }

    const { profileId } = getDesktopWorkspaceProfileContext()
    if (!profileId) {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'missing-profile-id'
      })
      return false
    }

    const route = buildDesktopNotificationRoute({
      notification,
      meetingByChatChannelId: buildMeetingByChatChannelIdIndex(meetingsStore)
    })
    const title = notification.actor_display_name || 'Nebulynk'

    logDesktopNotificationDiagnostic('[desktop-notify:dispatch]', {
      id: notification.id,
      server_id: profileId,
      route,
      title
    })

    const shown = await showDesktopNotification({
      title,
      body: notification.message_snippet || '',
      serverId: profileId,
      route
    })

    if (!shown) {
      logDesktopNotificationDiagnostic('[desktop-notify:skip]', {
        id: notification.id,
        reason: 'dispatch-failed'
      })
    }

    return shown
  }

  function refreshMembershipViews(membership) {
    const channelId = membership?.channel_id
    if (!channelId) return

    if (channelsStore.activeChannelId === channelId) {
      channelsStore.refreshMembers?.()?.catch?.(() => {})
    }

    if (dmsStore.hasDmChannel?.(channelId)) {
      dmsStore.refreshChannel?.(channelId)?.catch?.(() => {})
    }
  }

  function patchMeetingChannelLocally(channel) {
    if (!channel?.id || channel.purpose !== 'meeting') return false
    if (!meetingsStore?.hasMeetingChatChannel?.(channel.id)) return false

    channelsStore.patchChannel(channel)
    return true
  }

  socket.on('messages created', (message) => {
    const isOwnMessage = message.user_id === sessionStore.user?.id
    if (message.channel_id === channelsStore.activeChannelId) {
      messagesStore.addMessageIfMissing(message)
      if (!isOwnMessage && !channelsStore.isChannelInReadViewport?.(message.channel_id)) {
        channelsStore.incrementUnread(message.channel_id)
      } else {
        channelsStore.clearUnread?.(message.channel_id)
      }
    } else if (!isOwnMessage) {
      channelsStore.incrementUnread(message.channel_id)
    }

    const dmIndex = dmsStore.dmChannels.findIndex((entry) => entry.id === message.channel_id)
    if (dmIndex >= 0) {
      dmsStore.bumpChannelByMessage(message.channel_id, message.created_at)
    } else {
      const isKnownChannel = channelsStore.hasChannel(message.channel_id)
      const isMeetingChannel = meetingsStore?.hasMeetingChatChannel?.(message.channel_id)
      if (!isKnownChannel && !isMeetingChannel) {
        scheduleDmsRefresh()
      }
    }
  })

  socket.on('messages patched', (message) => {
    messagesStore.replaceMessage(message)
  })

  socket.on('messages removed', (message) => {
    messagesStore.removeMessage(message.id)
  })

  socket.on('user-roles created', () => {
    sessionStore.refreshPermissions().catch(() => {})
  })

  socket.on('user-roles removed', () => {
    sessionStore.refreshPermissions().catch(() => {})
  })

  socket.on('channels created', (channel) => {
    if (channel.type === 'dm' || channel.type === 'group') {
      dmsStore.refreshChannel(channel.id).catch(() => {
        scheduleDmsRefresh()
      })
    } else if (channel.purpose === 'meeting') {
      patchMeetingChannelLocally(channel)
    } else if (channelsStore.hasChannel(channel.id)) {
      channelsStore.patchChannel(channel)
    }
  })

  socket.on('channels patched', (channel) => {
    const previousChannel = (channelsStore.channels || []).find((entry) => entry.id === channel.id)
      || (dmsStore.dmChannels || []).find((entry) => entry.id === channel.id)
    const historyAccessChanged = !!previousChannel
      && previousChannel.meeting_history_access !== channel.meeting_history_access

    if (channel.type === 'dm' || channel.type === 'group') {
      dmsStore.refreshChannel(channel.id).catch(() => {
        scheduleDmsRefresh()
      })
    } else if (channel.purpose === 'meeting') {
      patchMeetingChannelLocally(channel)
    } else if (channelsStore.hasChannel(channel.id)) {
      channelsStore.patchChannel(channel)
    }

    if (historyAccessChanged) {
      meetingsStore.handleSourceHistoryAccessChanged?.(channel.id)?.catch?.(() => {})
    }
  })

  socket.on('channels removed', (channel) => {
    if (channel.type === 'dm' || channel.type === 'group') {
      dmsStore.removeChannel(channel.id)
    } else if (channel.purpose === 'meeting') {
      patchMeetingChannelLocally(channel)
    } else {
      channelsStore.removeChannel(channel.id)
    }
  })

  socket.on('channel-members created', (membership) => {
    if (!membership?.channel_id) return

    if (membership.user_id === sessionStore.user?.id) {
      if (membership.channel?.type === 'dm' || membership.channel?.type === 'group' || dmsStore.hasDmChannel?.(membership.channel_id)) {
        dmsStore.refreshChannel(membership.channel_id).catch(() => {
          scheduleDmsRefresh()
        })
        return
      }

      channelsStore.refreshChannel(membership.channel_id).catch(() => {
        refreshChannelsScoped()
      })
      return
    }

    refreshMembershipViews(membership)
  })

  socket.on('channel-members removed', (membership) => {
    if (!membership?.channel_id) return

    if (membership.user_id === sessionStore.user?.id) {
      channelsStore.removeChannel(membership.channel_id)
      dmsStore.removeChannel(membership.channel_id)
      if (channelsStore.activeChannelId === membership.channel_id) {
        channelsStore.clearActiveContext()
      }
      return
    }

    refreshMembershipViews(membership)
  })

  socket.on('message', (msg) => {
    if (msg.type === 'presence') {
      if (msg.status === 'online') {
        sessionStore.addOnlineUserId(msg.userId)
        sessionStore.reconcilePresenceUsers?.([msg.userId], { includeUnknown: true })?.catch?.(() => {})
      } else if (msg.status === 'offline') {
        sessionStore.removeOnlineUserId(msg.userId)
      }
    }

    if (msg.type === 'status-cleared') {
      sessionStore.clearStatusForUser(msg.userId)
    }

    if (msg.type === 'notifications created') {
      handleIncomingNotification(msg.data)
    }
  })

  socket.on('voice participant-joined', ({ channelId, participant }) => {
    const current = voiceStore.participants[channelId] || []
    const alreadyPresent = current.some((entry) => entry.user_id === participant.user_id)
    if (alreadyPresent) return

    voiceStore.addParticipant(channelId, participant)
    if (channelId === voiceStore.channelId && participant.user_id !== sessionStore.user?.id) {
      playSfx(SFX_EVENTS.VOICE_JOIN_OTHER)
    }
  })

  socket.on('voice participant-left', ({ channelId, userId }) => {
    const current = voiceStore.participants[channelId] || []
    const wasPresent = current.some((entry) => entry.user_id === userId)
    if (!wasPresent) return

    voiceStore.removeParticipant(channelId, userId)
    if (channelId === voiceStore.channelId && userId !== sessionStore.user?.id) {
      playSfx(SFX_EVENTS.VOICE_LEAVE_OTHER)
    }
  })

  socket.on('voice participant-updated', ({ channelId, userId, is_muted, is_deafened, is_video_enabled }) => {
    voiceStore.updateParticipant(channelId, userId, { is_muted, is_deafened, is_video_enabled })
  })

  socket.on('users patched', (user) => {
    sessionStore.applyUserPatch(user)
    if (CONNECTED_PRESENCE_STATUSES.has(user.status)) {
      sessionStore.addOnlineUserId(user.id)
      sessionStore.reconcilePresenceUsers?.([user.id], { includeUnknown: true })?.catch?.(() => {})
    } else if (user.status === 'offline') {
      sessionStore.removeOnlineUserId(user.id)
    }
  })

  socket.on('reactions created', (reaction) => {
    messagesStore.applyReactionCreated(reaction)
  })

  socket.on('reactions removed', (reaction) => {
    messagesStore.applyReactionRemoved(reaction)
  })

  socket.on('pinned-messages created', (pin) => {
    messagesStore.addPin(pin)
  })

  socket.on('pinned-messages removed', (pin) => {
    messagesStore.removePin(pin.id)
  })

  socket.on('invites created', (invite) => {
    sessionStore.applyInviteCreated(invite)
  })

  socket.on('invites patched', (invite) => {
    sessionStore.applyInvitePatched(invite)
  })

  socket.on('notifications created', (notification) => {
    handleIncomingNotification(notification)
  })

  socket.on('meetings created', (meeting) => {
    meetingsStore?.handleMeetingCreated(meeting)
  })

  socket.on('meetings invited', (payload) => {
    meetingsStore?.handleMeetingInvited(payload)
  })

  socket.on('meetings joined', (payload) => {
    meetingsStore?.handleMeetingJoined(payload)
  })

  socket.on('meetings ended', (payload) => {
    meetingsStore?.handleMeetingEnded(payload)
  })

  socket.on('meetings artifacts-queued', (payload) => {
    meetingsStore?.handleArtifactsQueued(payload)
  })

  socket.on('meetings artifacts-updated', (payload) => {
    meetingsStore?.handleArtifactsUpdated(payload)
  })

  socket.on('meetings recording-state-updated', (payload) => {
    meetingsStore?.handleRecordingStateUpdated(payload)
  })

  socket.on('voice-message-artifacts created', (artifact) => {
    voiceMessageArtifactsStore?.applyRealtimeArtifact?.(artifact)
  })

  socket.on('voice-message-artifacts patched', (artifact) => {
    voiceMessageArtifactsStore?.applyRealtimeArtifact?.(artifact)
  })

  socket.on('message-summaries created', (summary) => {
    messageSummariesStore?.applyRealtimeSummary?.(summary)
  })

  socket.on('message-summaries patched', (summary) => {
    messageSummariesStore?.applyRealtimeSummary?.(summary)
  })

  socket.on('message-summaries removed', (summary) => {
    messageSummariesStore?.applyRealtimeSummaryRemoved?.(summary)
  })
}
