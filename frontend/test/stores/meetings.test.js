import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMeetingsStore } from '../../src/stores/meetings.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn()
}))

const sfxMock = vi.hoisted(() => ({
  playSfx: vi.fn(),
  SFX_EVENTS: {
    CALL_INCOMING: 'call_incoming'
  }
}))

const channelsStoreMock = vi.hoisted(() => ({
  hasChannel: vi.fn(() => false),
  addChannel: vi.fn(),
  patchChannel: vi.fn(),
  select: vi.fn().mockResolvedValue(undefined),
  clearActiveContext: vi.fn()
}))

const voiceStoreMock = vi.hoisted(() => ({
  connectWithPayload: vi.fn().mockResolvedValue(undefined),
  leave: vi.fn().mockResolvedValue(undefined),
  clearChannelState: vi.fn(),
  channelId: null
}))

const dmsStoreMock = vi.hoisted(() => ({
  createGroup: vi.fn().mockResolvedValue({ id: 'group-1' })
}))

const sessionStoreMock = vi.hoisted(() => ({
  user: { id: 'user-self' }
}))

const notificationsStoreMock = vi.hoisted(() => ({
  markMeetingInviteRead: vi.fn().mockResolvedValue(0)
}))

const i18nMock = vi.hoisted(() => ({
  t: vi.fn((key, params = {}) => {
    if (key === 'ui.stores.joined_meeting_but_voice_connection_failed') {
      return `Joined meeting, but voice connection failed${params.suffix || ''}`
    }
    if (key === 'ui.views.call_with_name') {
      return `Call mit ${params.name || ''}`.trim()
    }
    if (key === 'ui.views.group_call_with_name') {
      return `Gruppencall: ${params.name || ''}`.trim()
    }
    if (key === 'ui.views.direct_message_source') {
      return 'Direktnachricht'
    }
    if (key === 'ui.views.group_chat_source') {
      return 'Gruppenchat'
    }
    if (key === 'ui.views.untitled_meeting') {
      return 'Unbenanntes Meeting'
    }
    if (key === 'ui.components.unknown_channel') {
      return 'Unbekannter Channel'
    }
    return key
  })
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

vi.mock('../../src/lib/sfx.js', () => sfxMock)

vi.mock('../../src/lib/i18n.js', () => i18nMock)

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

vi.mock('../../src/stores/voice.js', () => ({
  useVoiceStore: () => voiceStoreMock
}))

vi.mock('../../src/stores/dms.js', () => ({
  useDmsStore: () => dmsStoreMock
}))

vi.mock('../../src/stores/session.js', () => ({
  useSessionStore: () => sessionStoreMock
}))

vi.mock('../../src/stores/notifications.js', () => ({
  useNotificationsStore: () => notificationsStoreMock
}))

describe('meetings store', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.patch.mockReset()
    sfxMock.playSfx.mockReset()
    channelsStoreMock.hasChannel.mockReset()
    channelsStoreMock.hasChannel.mockReturnValue(false)
    channelsStoreMock.addChannel.mockReset()
    channelsStoreMock.patchChannel.mockReset()
    channelsStoreMock.select.mockReset()
    channelsStoreMock.select.mockResolvedValue(undefined)
    channelsStoreMock.clearActiveContext.mockReset()
    voiceStoreMock.connectWithPayload.mockReset()
    voiceStoreMock.connectWithPayload.mockResolvedValue(undefined)
    voiceStoreMock.leave.mockReset()
    voiceStoreMock.clearChannelState.mockReset()
    voiceStoreMock.channelId = null
    dmsStoreMock.createGroup.mockReset()
    dmsStoreMock.createGroup.mockResolvedValue({ id: 'group-1' })
    notificationsStoreMock.markMeetingInviteRead.mockReset()
    notificationsStoreMock.markMeetingInviteRead.mockResolvedValue(0)

    window.$notification = {
      info: vi.fn()
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('startFromChannel upserts meeting and registers meeting channel', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        id: 'meeting-1',
        title: 'Kickoff',
        chat_channel_id: 'meeting-channel-1',
        chat_channel: { name: 'meeting-1', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.startFromChannel('channel-source-1')

    expect(meeting.id).toBe('meeting-1')
    expect(store.meetings).toHaveLength(1)
    expect(store.meetings[0].id).toBe('meeting-1')
    expect(channelsStoreMock.addChannel).toHaveBeenCalledWith(expect.objectContaining({
      id: 'meeting-channel-1',
      purpose: 'meeting',
      is_voice: true
    }))
  })

  it('scheduleFromChannel posts schedule payload and caches the meeting', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        id: 'meeting-scheduled-1',
        status: 'scheduled',
        scheduled_start_at: '2026-04-21T10:00:00.000Z',
        chat_channel_id: 'meeting-channel-scheduled-1',
        chat_channel: { name: 'meeting-scheduled-1', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.scheduleFromChannel('channel-source-1', {
      title: 'Planung',
      description: 'Agenda',
      scheduledStartAt: '2026-04-21T10:00:00.000Z',
      scheduledEndAt: '2026-04-21T11:00:00.000Z',
      initialUserIds: ['user-2', 'user-3'],
      language: 'fr'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/meetings', {
      source_channel_id: 'channel-source-1',
      title: 'Planung',
      description: 'Agenda',
      scheduled_start_at: '2026-04-21T10:00:00.000Z',
      scheduled_end_at: '2026-04-21T11:00:00.000Z',
      initial_user_ids: ['user-2', 'user-3'],
      language: 'fr'
    })
    expect(meeting.status).toBe('scheduled')
    expect(store.getMeetingById('meeting-scheduled-1')?.status).toBe('scheduled')
  })

  it('setLanguage patches the meeting endpoint and merges the refreshed meeting payload', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        id: 'meeting-language-1',
        status: 'active',
        language: 'it',
        chat_channel_id: 'meeting-channel-language-1',
        chat_channel: { name: 'meeting-language-1', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.setLanguage('meeting-language-1', 'it')

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-language-1', {
      action: 'set_language',
      language: 'it'
    })
    expect(meeting.language).toBe('it')
    expect(store.getMeetingById('meeting-language-1')?.language).toBe('it')
  })

  it('join delegates to meetings endpoint, channel selection and voice payload connect', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        meeting: {
          id: 'meeting-2',
          title: 'Weekly Sync',
          source_channel: { id: 'channel-9', name: 'general' },
          chat_channel_id: 'meeting-channel-2',
          chat_channel: { name: 'meeting-2', is_archived: false }
        },
        voice: {
          token: 'voice-token',
          url: 'ws://livekit.local',
          channelId: 'meeting-channel-2',
          channelName: 'meeting-2',
          participants: []
        }
      }
    })

    const store = useMeetingsStore()
    const result = await store.join('meeting-2')

    expect(result.meeting.id).toBe('meeting-2')
    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-2', { action: 'join' })
    expect(channelsStoreMock.select).toHaveBeenCalledWith('meeting-channel-2')
    expect(voiceStoreMock.connectWithPayload).toHaveBeenCalledWith({
      token: 'voice-token',
      url: 'ws://livekit.local',
      channelId: 'meeting-channel-2',
      channelName: 'Weekly Sync',
      participants: []
    }, {
      requestMicrophonePermission: true
    })
  })

  it('setActive marks matching meeting invite notifications read when opening a meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-active-open',
        title: 'Weekly Sync',
        chat_channel_id: 'meeting-channel-active-open',
        chat_channel: { name: 'meeting-active-open', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.setActive('meeting-active-open')

    expect(meeting.id).toBe('meeting-active-open')
    expect(notificationsStoreMock.markMeetingInviteRead).toHaveBeenCalledWith('meeting-active-open')
    expect(channelsStoreMock.select).toHaveBeenCalledWith('meeting-channel-active-open')
  })

  it('loadOverviewBuckets fetches grouped overview payloads, probes for more past meetings, and merges visible results into the cache', async () => {
    const visiblePastMeetings = Array.from({ length: 8 }, (_, index) => ({
      id: `meeting-past-${index + 1}`,
      status: 'ended',
      chat_channel_id: `meeting-past-channel-${index + 1}`,
      chat_channel: { name: `meeting-past-${index + 1}`, is_archived: true },
      artifacts: [{
        artifact_type: 'summary',
        status: 'ready',
        payload: {
          mini_summary: `Kurzfassung ${index + 1}`
        }
      }]
    }))

    apiMock.get
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'meeting-upcoming-1',
            status: 'scheduled',
            chat_channel_id: 'meeting-upcoming-channel-1',
            chat_channel: { name: 'meeting-upcoming-1', is_archived: false }
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'meeting-live-1',
            status: 'active',
            chat_channel_id: 'meeting-live-channel-1',
            chat_channel: { name: 'meeting-live-1', is_archived: false }
          }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            ...visiblePastMeetings,
            {
              id: 'meeting-past-9',
              status: 'ended',
              chat_channel_id: 'meeting-past-channel-9',
              chat_channel: { name: 'meeting-past-9', is_archived: true },
              artifacts: [{
                artifact_type: 'summary',
                status: 'ready',
                payload: {
                  mini_summary: 'Kurzfassung 9'
                }
              }]
            }
          ]
        }
      })

    const store = useMeetingsStore()
    const buckets = await store.loadOverviewBuckets({ pastVisibleCount: 8 })

    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/meetings', {
      params: {
        time_bucket: 'upcoming',
        detail: 'summary',
        $limit: 100
      }
    })
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/meetings', {
      params: {
        time_bucket: 'live',
        detail: 'summary',
        $limit: 100
      }
    })
    expect(apiMock.get).toHaveBeenNthCalledWith(3, '/meetings', {
      params: {
        time_bucket: 'past',
        include_ended: true,
        detail: 'full',
        $limit: 9
      }
    })
    expect(buckets.upcoming).toHaveLength(1)
    expect(buckets.live).toHaveLength(1)
    expect(buckets.past).toHaveLength(8)
    expect(buckets.pastHasMore).toBe(true)
    expect(buckets.past.map((meeting) => meeting.id)).toEqual(visiblePastMeetings.map((meeting) => meeting.id))
    expect(store.getMeetingById('meeting-past-1')?.artifacts).toEqual([{
      artifact_type: 'summary',
      status: 'ready',
      payload: {
        mini_summary: 'Kurzfassung 1'
      }
    }])
    expect(store.getMeetingById('meeting-past-9')).toBeNull()
  })

  it('generateSummary patches the meeting endpoint and merges the refreshed meeting payload', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        id: 'meeting-generate-1',
        status: 'ended',
        chat_channel_id: 'meeting-channel-generate-1',
        chat_channel: { name: 'meeting-generate-1', is_archived: true },
        summary_generation: {
          available: false,
          allowed: false,
          action: null,
          reason: 'processing'
        },
        artifacts: [{ artifact_type: 'summary', status: 'processing' }]
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.generateSummary('meeting-generate-1')

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-generate-1', {
      action: 'generate_summary'
    })
    expect(meeting.artifacts).toEqual([{ artifact_type: 'summary', status: 'processing' }])
    expect(store.getMeetingById('meeting-generate-1')).toEqual(expect.objectContaining({
      id: 'meeting-generate-1',
      summary_generation: {
        available: false,
        allowed: false,
        action: null,
        reason: 'processing'
      }
    }))
  })

  it('invalidates ended meeting details and immediately reloads an open restricted meeting', async () => {
    apiMock.get
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-history-1',
          status: 'ended',
          source_channel_id: 'source-history-1',
          chat_channel_id: 'meeting-channel-history-1',
          description: 'Previously readable',
          content_access: { allowed: true, denial_reason: null }
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-history-1',
          status: 'ended',
          source_channel_id: 'source-history-1',
          detail_level: 'card',
          content_access: {
            allowed: false,
            denial_reason: 'channel_meeting_history_policy'
          }
        }
      })

    const store = useMeetingsStore()
    await store.setActive('meeting-history-1')
    await store.handleSourceHistoryAccessChanged('source-history-1')

    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/meetings/meeting-history-1')
    expect(store.activeMeeting.content_access.allowed).toBe(false)
    expect(store.activeMeeting.description).toBeUndefined()
    expect(store.historyAccessRevision).toBe(1)
    expect(channelsStoreMock.clearActiveContext).toHaveBeenCalledTimes(1)
  })

  it('generateSummary forwards an optional reason for admin regeneration flows', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        id: 'meeting-generate-reason-1',
        status: 'ended',
        chat_channel_id: 'meeting-channel-generate-reason-1',
        chat_channel: { name: 'meeting-generate-reason-1', is_archived: true }
      }
    })

    const store = useMeetingsStore()
    await store.generateSummary('meeting-generate-reason-1', { reason: 'admin_regenerate' })

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-generate-reason-1', {
      action: 'generate_summary',
      reason: 'admin_regenerate'
    })
  })

  it('createInviteLink and revokeInviteLink patch the meeting endpoint', async () => {
    apiMock.patch
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-link-1',
          status: 'scheduled',
          guest_invite_link: {
            id: 'link-1',
            join_url: 'https://app.local/meeting-invite/token-1'
          },
          chat_channel_id: 'meeting-channel-link-1',
          chat_channel: { name: 'meeting-link-1', is_archived: false }
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-link-1',
          status: 'scheduled',
          guest_invite_link: null,
          chat_channel_id: 'meeting-channel-link-1',
          chat_channel: { name: 'meeting-link-1', is_archived: false }
        }
      })

    const store = useMeetingsStore()
    const created = await store.createInviteLink('meeting-link-1', '2026-04-21T11:00:00.000Z')
    const revoked = await store.revokeInviteLink('meeting-link-1', 'link-1')

    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/meetings/meeting-link-1', {
      action: 'create_invite_link',
      expires_at: '2026-04-21T11:00:00.000Z'
    })
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/meetings/meeting-link-1', {
      action: 'revoke_invite_link',
      link_id: 'link-1'
    })
    expect(created.guest_invite_link.join_url).toBe('https://app.local/meeting-invite/token-1')
    expect(revoked.guest_invite_link).toBeNull()
  })

  it('generateTranscript patches the meeting endpoint and merges the refreshed meeting payload', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        id: 'meeting-transcript-retry-1',
        status: 'ended',
        chat_channel_id: 'meeting-channel-transcript-retry-1',
        chat_channel: { name: 'meeting-transcript-retry-1', is_archived: true },
        transcript_generation: {
          available: false,
          allowed: false,
          action: null,
          reason: 'processing'
        },
        artifacts: [{ artifact_type: 'transcript', status: 'processing' }]
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.generateTranscript('meeting-transcript-retry-1')

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-transcript-retry-1', {
      action: 'generate_transcript'
    })
    expect(meeting.artifacts).toEqual([{ artifact_type: 'transcript', status: 'processing' }])
    expect(store.getMeetingById('meeting-transcript-retry-1')).toEqual(expect.objectContaining({
      id: 'meeting-transcript-retry-1',
      transcript_generation: {
        available: false,
        allowed: false,
        action: null,
        reason: 'processing'
      }
    }))
  })

  it('generateTranscript forwards an optional reason for admin regeneration flows', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        id: 'meeting-transcript-reason-1',
        status: 'ended',
        chat_channel_id: 'meeting-channel-transcript-reason-1',
        chat_channel: { name: 'meeting-transcript-reason-1', is_archived: true }
      }
    })

    const store = useMeetingsStore()
    await store.generateTranscript('meeting-transcript-reason-1', { reason: 'admin_regenerate' })

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-transcript-reason-1', {
      action: 'generate_transcript',
      reason: 'admin_regenerate'
    })
  })

  it('clearActive only resets the active meeting context and preserves cached meetings', () => {
    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-clear-1',
      title: 'Weekly Sync',
      chat_channel_id: 'meeting-channel-clear-1',
      chat_channel: { name: 'meeting-clear-1', is_archived: false }
    })
    store.activeMeetingId = 'meeting-clear-1'
    store.activeMeeting = {
      id: 'meeting-clear-1',
      title: 'Weekly Sync',
      chat_channel_id: 'meeting-channel-clear-1'
    }

    store.clearActive()

    expect(store.activeMeetingId).toBeNull()
    expect(store.activeMeeting).toBeNull()
    expect(store.getMeetingById('meeting-clear-1')).toEqual(expect.objectContaining({
      id: 'meeting-clear-1'
    }))
  })

  it('join does not throw when voice connect fails after successful meeting join', async () => {
    apiMock.patch.mockResolvedValueOnce({
      data: {
        meeting: {
          id: 'meeting-voice-fail',
          title: 'Weekly Sync',
          source_channel: { id: 'channel-9', name: 'general' },
          chat_channel_id: 'meeting-channel-voice-fail',
          chat_channel: { name: 'meeting-voice-fail', is_archived: false }
        },
        voice: {
          token: 'voice-token',
          url: 'ws://livekit.local',
          channelId: 'meeting-channel-voice-fail',
          channelName: 'meeting-voice-fail',
          participants: []
        }
      }
    })
    voiceStoreMock.connectWithPayload.mockRejectedValueOnce(new Error('Mic permission denied'))

    const store = useMeetingsStore()
    const result = await store.join('meeting-voice-fail')

    expect(result.meeting.id).toBe('meeting-voice-fail')
    expect(window.$message.warning).toHaveBeenCalledWith(expect.stringContaining('Joined meeting, but voice connection failed'))
  })

  it('fetchActiveBySourceChannel queries meetings endpoint with source_channel filter', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'meeting-7',
            source_channel_id: 'channel-42',
            status: 'active',
            chat_channel_id: 'meeting-channel-7',
            chat_channel: { name: 'meeting-7', is_archived: false }
          }
        ]
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.fetchActiveBySourceChannel('channel-42')

    expect(apiMock.get).toHaveBeenCalledWith('/meetings', {
      params: { source_channel_id: 'channel-42', status: 'active', $limit: 1 }
    })
    expect(meeting?.id).toBe('meeting-7')
  })

  it('fetchBySourceChannel forwards detail, limit, and time bucket options for panel pagination', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'meeting-ended-1',
            status: 'ended',
            source_channel_id: 'channel-42',
            chat_channel_id: 'meeting-channel-ended-1',
            chat_channel: { name: 'meeting-ended-1', is_archived: true },
            artifacts: [{ artifact_type: 'summary', status: 'ready' }]
          }
        ]
      }
    })

    const store = useMeetingsStore()
    const meetings = await store.fetchBySourceChannel('channel-42', {
      includeEnded: true,
      detail: 'full',
      limit: 5,
      timeBucket: 'past'
    })

    expect(apiMock.get).toHaveBeenCalledWith('/meetings', {
      params: {
        source_channel_id: 'channel-42',
        include_ended: true,
        time_bucket: 'past',
        detail: 'full',
        $limit: 5
      }
    })
    expect(meetings).toHaveLength(1)
    expect(store.getMeetingById('meeting-ended-1')?.artifacts).toEqual([
      { artifact_type: 'summary', status: 'ready' }
    ])
  })

  it('findMeetingByChatChannelId prefers active meeting from current store state', async () => {
    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-ended',
      status: 'ended',
      chat_channel_id: 'meeting-channel-11',
      chat_channel: { name: 'meeting-ended', is_archived: true }
    })
    store.upsertMeeting({
      id: 'meeting-active',
      status: 'active',
      chat_channel_id: 'meeting-channel-11',
      chat_channel: { name: 'meeting-active', is_archived: false }
    })

    const meeting = await store.findMeetingByChatChannelId('meeting-channel-11', { refreshIfMissing: false })

    expect(meeting?.id).toBe('meeting-active')
    expect(apiMock.get).not.toHaveBeenCalled()
  })

  it('findMeetingByChatChannelId refreshes meetings when chat channel is missing', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'meeting-8',
            detail_level: 'summary',
            status: 'active',
            source_channel_id: 'channel-8',
            source_channel: { id: 'channel-8', name: 'general' },
            chat_channel_id: 'meeting-channel-8',
            chat_channel: { name: 'meeting-8', is_archived: false }
          }
        ]
      }
    })

    const store = useMeetingsStore()
    const meeting = await store.findMeetingByChatChannelId('meeting-channel-8')

    expect(apiMock.get).toHaveBeenCalledWith('/meetings', {
      params: { include_ended: true, $limit: 100 }
    })
    expect(meeting?.id).toBe('meeting-8')
  })

  it('refresh keeps previously loaded detail fields when list endpoint returns summaries', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'meeting-summary-1',
            detail_level: 'summary',
            status: 'active',
            title: 'Updated Summary Title',
            engaged_participant_count: 4,
            source_channel_id: 'source-summary-1',
            source_channel: { id: 'source-summary-1', name: 'general', type: 'private' },
            chat_channel_id: 'meeting-channel-summary-1',
            chat_channel: { name: 'meeting-summary-1', is_archived: false }
          }
        ]
      }
    })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-summary-1',
      detail_level: 'full',
      status: 'active',
      title: 'Original Detail Title',
      source_channel_id: 'source-summary-1',
      source_channel: { id: 'source-summary-1', name: 'general', type: 'private' },
      chat_channel_id: 'meeting-channel-summary-1',
      chat_channel: { name: 'meeting-summary-1', is_archived: false },
      participants: [{ user_id: 'user-a' }],
      artifacts: [{ artifact_type: 'summary', status: 'ready' }]
    })

    await store.refresh()

    expect(store.getMeetingById('meeting-summary-1')).toEqual(expect.objectContaining({
      id: 'meeting-summary-1',
      detail_level: 'full',
      title: 'Updated Summary Title',
      engaged_participant_count: 4,
      participants: [{ user_id: 'user-a' }],
      artifacts: [{ artifact_type: 'summary', status: 'ready' }]
    }))
  })

  it('ensureMeetingLoaded deduplicates parallel loads for the same meeting id', async () => {
    let resolveRequest
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve
    })

    apiMock.get.mockReturnValueOnce(requestPromise)

    const store = useMeetingsStore()
    const firstLoad = store.ensureMeetingLoaded('meeting-lazy-1')
    const secondLoad = store.ensureMeetingLoaded('meeting-lazy-1')

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-lazy-1')

    resolveRequest({
      data: {
        id: 'meeting-lazy-1',
        status: 'active',
        source_channel_id: 'channel-lazy-1',
        source_channel: { id: 'channel-lazy-1', name: 'general' },
        chat_channel_id: 'meeting-channel-lazy-1',
        chat_channel: { name: 'meeting-lazy-1', is_archived: false }
      }
    })

    const [firstMeeting, secondMeeting] = await Promise.all([firstLoad, secondLoad])
    expect(firstMeeting.id).toBe('meeting-lazy-1')
    expect(secondMeeting.id).toBe('meeting-lazy-1')
    expect(store.getMeetingById('meeting-lazy-1')?.id).toBe('meeting-lazy-1')

    await store.ensureMeetingLoaded('meeting-lazy-1')
    expect(apiMock.get).toHaveBeenCalledTimes(1)
  })

  it('ensureMeetingLoaded upgrades a cached summary meeting when full detail is requested', async () => {
    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-ended-1',
      detail_level: 'summary',
      status: 'ended',
      source_channel_id: 'source-ended-1',
      source_channel: { id: 'source-ended-1', name: 'general', type: 'private' },
      chat_channel_id: 'meeting-channel-ended-1',
      chat_channel: { name: 'meeting-ended-1', is_archived: true }
    })

    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-ended-1',
        detail_level: 'full',
        status: 'ended',
        source_channel_id: 'source-ended-1',
        source_channel: { id: 'source-ended-1', name: 'general', type: 'private' },
        chat_channel_id: 'meeting-channel-ended-1',
        chat_channel: { name: 'meeting-ended-1', is_archived: true },
        participants: [{ user_id: 'user-a' }],
        artifacts: [{
          artifact_type: 'summary',
          status: 'ready',
          payload: {
            mini_summary: 'Retro decisions and next steps.'
          }
        }]
      }
    })

    const meeting = await store.ensureMeetingLoaded('meeting-ended-1', { detail: 'full' })

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-ended-1')
    expect(meeting).toEqual(expect.objectContaining({
      id: 'meeting-ended-1',
      detail_level: 'full',
      participants: [{ user_id: 'user-a' }],
      artifacts: [expect.objectContaining({
        artifact_type: 'summary',
        status: 'ready',
        payload: expect.objectContaining({
          mini_summary: 'Retro decisions and next steps.'
        })
      })]
    }))

    await store.ensureMeetingLoaded('meeting-ended-1', { detail: 'full' })
    expect(apiMock.get).toHaveBeenCalledTimes(1)
  })

  it('upsertMeeting does not let a summary payload remove existing detail data', () => {
    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-merge-1',
      detail_level: 'full',
      status: 'active',
      source_channel_id: 'source-merge-1',
      source_channel: { id: 'source-merge-1', name: 'ops', type: 'private' },
      chat_channel_id: 'meeting-channel-merge-1',
      chat_channel: { name: 'meeting-merge-1', is_archived: false },
      participants: [{ user_id: 'user-a' }],
      artifacts: [{ artifact_type: 'transcript', status: 'processing' }]
    })

    store.upsertMeeting({
      id: 'meeting-merge-1',
      detail_level: 'summary',
      status: 'ended',
      engaged_participant_count: 3,
      source_channel_id: 'source-merge-1',
      source_channel: { id: 'source-merge-1', name: 'ops-updated' },
      chat_channel_id: 'meeting-channel-merge-1',
      chat_channel: { name: 'meeting-merge-1', is_archived: true }
    })

    expect(store.getMeetingById('meeting-merge-1')).toEqual(expect.objectContaining({
      id: 'meeting-merge-1',
      detail_level: 'full',
      status: 'ended',
      engaged_participant_count: 3,
      participants: [{ user_id: 'user-a' }],
      artifacts: [{ artifact_type: 'transcript', status: 'processing' }],
      source_channel: expect.objectContaining({ name: 'ops-updated' }),
      chat_channel: expect.objectContaining({ is_archived: true })
    }))
  })

  it('handleArtifactsUpdated refreshes already loaded meetings', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-artifact-update',
        detail_level: 'full',
        status: 'ended',
        source_channel_id: 'source-1',
        source_channel: { id: 'source-1', name: 'ops', type: 'private' },
        chat_channel_id: 'meeting-channel-artifact-update',
        chat_channel: { name: 'meeting-artifact-update', is_archived: true },
        artifacts: [{ artifact_type: 'transcript', status: 'ready' }]
      }
    })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-artifact-update',
      detail_level: 'summary',
      status: 'ended',
      source_channel_id: 'source-1',
      source_channel: { id: 'source-1', name: 'ops', type: 'private' },
      chat_channel_id: 'meeting-channel-artifact-update',
      chat_channel: { name: 'meeting-artifact-update', is_archived: true }
    })

    store.handleArtifactsUpdated({ meetingId: 'meeting-artifact-update' })
    await Promise.resolve()

    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-artifact-update')
  })

  it('exposes active source channel ids from active meetings only', () => {
    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-active-source',
      status: 'active',
      source_channel_id: 'channel-active',
      chat_channel_id: 'meeting-channel-active',
      chat_channel: { name: 'meeting-active', is_archived: false }
    })
    store.upsertMeeting({
      id: 'meeting-ended-source',
      status: 'ended',
      source_channel_id: 'channel-ended',
      chat_channel_id: 'meeting-channel-ended',
      chat_channel: { name: 'meeting-ended', is_archived: true }
    })

    expect(store.activeSourceChannelIds.has('channel-active')).toBe(true)
    expect(store.activeSourceChannelIds.has('channel-ended')).toBe(false)
    expect(store.hasActiveMeetingForSourceChannel('channel-active')).toBe(true)
    expect(store.hasActiveMeetingForSourceChannel('channel-ended')).toBe(false)
  })

  it('maybeCreateGroupFromMeetingParticipants skips group-source meetings', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-group-source',
        title: 'Group Meeting',
        source_channel: { id: 'group-1', type: 'group', name: 'Ops Group' },
        participants: [
          { user_id: 'user-self' },
          { user_id: 'user-a' },
          { user_id: 'user-b' }
        ]
      }
    })

    const store = useMeetingsStore()
    const group = await store.maybeCreateGroupFromMeetingParticipants('meeting-group-source')

    expect(group).toBeNull()
    expect(dmsStoreMock.createGroup).not.toHaveBeenCalled()
    expect(channelsStoreMock.select).not.toHaveBeenCalled()
  })

  it('maybeCreateGroupFromMeetingParticipants creates follow-up group for non-group source channels', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-public-source',
        title: 'Weekly Sync',
        source_channel: { id: 'channel-ops', type: 'private', name: 'Ops' },
        participants: [
          { user_id: 'user-self' },
          { user_id: 'user-a' },
          { user_id: 'user-b' }
        ]
      }
    })

    const store = useMeetingsStore()
    const group = await store.maybeCreateGroupFromMeetingParticipants('meeting-public-source')

    expect(group).toEqual({ id: 'group-1' })
    expect(dmsStoreMock.createGroup).toHaveBeenCalledWith(['user-a', 'user-b'], 'Weekly Sync')
    expect(channelsStoreMock.select).toHaveBeenCalledWith('group-1')
  })

  it('resolveDisplayName renders contextual DM title for legacy technical titles', () => {
    const store = useMeetingsStore()
    const title = store.resolveDisplayName({
      id: 'meeting-dm-1',
      title: 'dm-dm-source',
      source_channel_id: 'dm-source',
      source_channel: {
        id: 'dm-source',
        type: 'dm',
        name: 'dm-dm-source',
        display_name: 'Alex'
      },
      chat_channel: { name: 'meeting-meeting-dm-1', is_archived: false }
    })

    expect(title).toBe('Call mit Alex')
  })

  it('resolveDisplayName renders contextual group title from source display name', () => {
    const store = useMeetingsStore()
    const title = store.resolveDisplayName({
      id: 'meeting-group-1',
      title: null,
      source_channel_id: 'group-source',
      source_channel: {
        id: 'group-source',
        type: 'group',
        name: 'group-group-source',
        display_name: 'Alex, Sam +2'
      },
      chat_channel: { name: 'meeting-meeting-group-1', is_archived: false }
    })

    expect(title).toBe('Gruppencall: Alex, Sam +2')
  })

  it('resolveIncomingCallSourceName prioritizes source_channel_display_name over raw source_channel_name', () => {
    const store = useMeetingsStore()
    const sourceName = store.resolveIncomingCallSourceName({
      meeting_id: 'meeting-call-1',
      source_channel_id: 'dm-source',
      source_channel_name: 'dm-dm-source',
      source_channel_display_name: 'Alex'
    })

    expect(sourceName).toBe('Alex')
  })

  it('incoming calls ring and auto-decline after timeout', async () => {
    vi.useFakeTimers()
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-3',
        title: 'Daily Sync',
        status: 'active',
        source_channel_id: 'channel-source-3',
        source_channel: { id: 'channel-source-3', name: 'General' },
        chat_channel_id: 'meeting-channel-3',
        chat_channel: { name: 'meeting-3', is_archived: false }
      }
    })
    apiMock.patch.mockResolvedValueOnce({ data: {} })

    const store = useMeetingsStore()
    await store.handleMeetingInvited({
      meetingId: 'meeting-3',
      sourceChannelId: 'channel-source-3',
      sourceChannelName: 'General',
      meetingStatus: 'active',
      userIds: ['user-self']
    })

    expect(store.incomingCalls).toHaveLength(1)
    expect(sfxMock.playSfx).toHaveBeenCalledWith(sfxMock.SFX_EVENTS.CALL_INCOMING)

    vi.advanceTimersByTime(30_000)
    await Promise.resolve()
    await Promise.resolve()

    expect(apiMock.patch).toHaveBeenCalledWith('/meetings/meeting-3', { action: 'decline' })
    expect(store.incomingCalls).toHaveLength(0)
  })

  it('incoming call toast uses human-readable meeting and source labels', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-toast-1',
        title: 'dm-dm-source',
        status: 'active',
        source_channel_id: 'dm-source',
        source_channel: {
          id: 'dm-source',
          type: 'dm',
          name: 'dm-dm-source',
          display_name: 'Alex'
        },
        chat_channel_id: 'meeting-channel-toast-1',
        chat_channel: { name: 'meeting-meeting-toast-1', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    await store.handleMeetingInvited({
      meetingId: 'meeting-toast-1',
      sourceChannelId: 'dm-source',
      sourceChannelName: 'dm-dm-source',
      sourceChannelDisplayName: 'Alex',
      meetingTitle: 'dm-dm-source',
      meetingStatus: 'active',
      userIds: ['user-self']
    })

    expect(window.$notification.info).toHaveBeenCalledWith({
      title: 'ui.components.incoming_call',
      content: 'Call mit Alex',
      meta: 'Alex',
      duration: 6000
    })
  })

  it('handleMeetingEnded silently exits active voice channel for ended meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-9',
        chat_channel_id: 'meeting-channel-9',
        chat_channel: { name: 'meeting-9', is_archived: true },
        source_channel: { id: 'source-1', name: 'general' },
        status: 'ended',
        ended_by: 'user-other'
      }
    })
    voiceStoreMock.channelId = 'meeting-channel-9'

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-9',
      chat_channel_id: 'meeting-channel-9',
      chat_channel: { name: 'meeting-9', is_archived: false },
      source_channel: { id: 'source-1', name: 'general' },
      status: 'active'
    })

    await store.handleMeetingEnded({
      meetingId: 'meeting-9',
      chatChannelId: 'meeting-channel-9',
      status: 'ended',
      chatChannelArchived: true
    })

    expect(voiceStoreMock.leave).toHaveBeenCalledWith({
      playLeaveSfx: false,
      notifyErrors: false,
      skipBackendLeave: true
    })
    expect(voiceStoreMock.clearChannelState).toHaveBeenCalledWith('meeting-channel-9')
    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-9')
    expect(store.getMeetingById('meeting-9')?.status).toBe('ended')
    expect(store.getMeetingById('meeting-9')?.chat_channel?.is_archived).toBe(true)
  })

  it('handleMeetingJoined refreshes only the affected loaded meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-joined-1',
        status: 'active',
        source_channel: { id: 'source-joined-1', name: 'general' },
        chat_channel_id: 'meeting-channel-joined-1',
        chat_channel: { name: 'meeting-joined-1', is_archived: false }
      }
    })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-joined-1',
      status: 'active',
      source_channel: { id: 'source-joined-1', name: 'general' },
      chat_channel_id: 'meeting-channel-joined-1',
      chat_channel: { name: 'meeting-joined-1', is_archived: false }
    })

    await store.handleMeetingJoined({
      meetingId: 'meeting-joined-1',
      userId: 'user-other',
      status: 'active'
    })

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-joined-1')
  })

  it('handleArtifactsQueued refreshes only the affected active meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-artifacts-1',
        status: 'active',
        source_channel: { id: 'source-artifacts-1', name: 'general' },
        chat_channel_id: 'meeting-channel-artifacts-1',
        chat_channel: { name: 'meeting-artifacts-1', is_archived: false },
        artifacts: [{ artifact_type: 'summary', status: 'processing' }]
      }
    })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-artifacts-1',
      status: 'active',
      source_channel: { id: 'source-artifacts-1', name: 'general' },
      chat_channel_id: 'meeting-channel-artifacts-1',
      chat_channel: { name: 'meeting-artifacts-1', is_archived: false }
    })
    store.activeMeetingId = 'meeting-artifacts-1'

    await store.handleArtifactsQueued({
      meetingId: 'meeting-artifacts-1'
    })

    expect(apiMock.get).toHaveBeenCalledTimes(1)
    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-artifacts-1')
    expect(store.getMeetingById('meeting-artifacts-1')?.artifacts).toEqual([
      { artifact_type: 'summary', status: 'processing' }
    ])
  })

  it('pauseTranscriptionRecording and resumeTranscriptionRecording call meeting patch actions', async () => {
    apiMock.patch
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-recording-1',
          status: 'active',
          chat_channel_id: 'meeting-channel-recording-1',
          transcription_recording: { visible: true, status: 'paused' }
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'meeting-recording-1',
          status: 'active',
          chat_channel_id: 'meeting-channel-recording-1',
          transcription_recording: { visible: true, status: 'recording' }
        }
      })

    const store = useMeetingsStore()
    await store.pauseTranscriptionRecording('meeting-recording-1')
    await store.resumeTranscriptionRecording('meeting-recording-1')

    expect(apiMock.patch).toHaveBeenNthCalledWith(1, '/meetings/meeting-recording-1', {
      action: 'pause_transcription_recording'
    })
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, '/meetings/meeting-recording-1', {
      action: 'resume_transcription_recording'
    })
    expect(store.getMeetingById('meeting-recording-1')?.transcription_recording.status).toBe('recording')
  })

  it('handleRecordingStateUpdated refreshes only the affected loaded meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        id: 'meeting-recording-state-1',
        status: 'active',
        source_channel: { id: 'source-recording-state-1', name: 'general' },
        chat_channel_id: 'meeting-channel-recording-state-1',
        chat_channel: { name: 'meeting-recording-state-1', is_archived: false },
        transcription_recording: { visible: true, status: 'paused' }
      }
    })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-recording-state-1',
      status: 'active',
      source_channel: { id: 'source-recording-state-1', name: 'general' },
      chat_channel_id: 'meeting-channel-recording-state-1',
      chat_channel: { name: 'meeting-recording-state-1', is_archived: false },
      transcription_recording: { visible: true, status: 'recording' }
    })

    await store.handleRecordingStateUpdated({
      meetingId: 'meeting-recording-state-1'
    })

    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-recording-state-1')
    expect(store.getMeetingById('meeting-recording-state-1')?.transcription_recording.status).toBe('paused')
  })

  it('loadQuestions hydrates private Ask the Meeting history for the selected meeting', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        data: [{
          id: 'question-1',
          meeting_id: 'meeting-question-1',
          question: 'Was wurde entschieden?',
          answer: 'Rollout bleibt fuer Freitag geplant.',
          citations: []
        }]
      }
    })

    const store = useMeetingsStore()
    const questions = await store.loadQuestions('meeting-question-1')

    expect(apiMock.get).toHaveBeenCalledWith('/meeting-questions', {
      params: { meeting_id: 'meeting-question-1' }
    })
    expect(questions).toHaveLength(1)
    expect(store.getQuestions('meeting-question-1')[0].id).toBe('question-1')
  })

  it('askQuestion appends a new private answer to the cached meeting history', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        id: 'question-2',
        meeting_id: 'meeting-question-2',
        question: 'Gibt es Risiken?',
        answer: 'Monitoring ist noch offen.',
        citations: []
      }
    })

    const store = useMeetingsStore()
    const entry = await store.askQuestion('meeting-question-2', 'Gibt es Risiken?')

    expect(apiMock.post).toHaveBeenCalledWith('/meeting-questions', {
      meeting_id: 'meeting-question-2',
      question: 'Gibt es Risiken?'
    })
    expect(entry.id).toBe('question-2')
    expect(store.getQuestions('meeting-question-2')).toEqual([
      expect.objectContaining({ id: 'question-2' })
    ])
  })

  it('schedules a debounced recovery refresh when targeted meeting sync fails', async () => {
    vi.useFakeTimers()
    apiMock.get
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ data: { data: [] } })

    const store = useMeetingsStore()
    store.upsertMeeting({
      id: 'meeting-recovery-1',
      status: 'active',
      source_channel: { id: 'source-recovery-1', name: 'general' },
      chat_channel_id: 'meeting-channel-recovery-1',
      chat_channel: { name: 'meeting-recovery-1', is_archived: false }
    })

    await store.handleMeetingJoined({
      meetingId: 'meeting-recovery-1',
      userId: 'user-other'
    })
    await Promise.resolve()

    expect(apiMock.get).toHaveBeenCalledWith('/meetings/meeting-recovery-1')
    expect(apiMock.get).toHaveBeenCalledTimes(1)

    await vi.runOnlyPendingTimersAsync()

    expect(apiMock.get).toHaveBeenCalledTimes(2)
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/meetings', {
      params: { include_ended: true, $limit: 100 }
    })
  })
})
