import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceStore } from '../../src/stores/voice.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const livekitMock = vi.hoisted(() => ({
  applyScreenShareViewQuality: vi.fn(),
  connectToRoom: vi.fn().mockResolvedValue(undefined),
  disconnectFromRoom: vi.fn().mockResolvedValue(undefined),
  getActiveVideoInputDevice: vi.fn(() => null),
  getVideoInputDevices: vi.fn().mockResolvedValue([]),
  hasBackgroundBlurEnabled: vi.fn(() => false),
  isBackgroundBlurSupported: vi.fn(() => true),
  isModernBackgroundBlurSupported: vi.fn(() => true),
  setCallbacks: vi.fn(),
  setBackgroundBlurEnabled: vi.fn().mockResolvedValue(undefined),
  setRemoteCameraSubscription: vi.fn(),
  setDeafened: vi.fn(),
  setMasterVolume: vi.fn(),
  setVideoInputDevice: vi.fn().mockResolvedValue(undefined),
  startCamera: vi.fn().mockResolvedValue({
    track: { id: 'camera-track-1' },
    publication: { trackSid: 'camera-pub-1' },
    deviceId: null,
    backgroundBlurEnabled: false
  }),
  startScreenShare: vi.fn().mockResolvedValue({
    track: { id: 'screen-track-1' },
    audioTrack: { id: 'screen-audio-1' },
    hasAudio: true
  }),
  stopCamera: vi.fn().mockResolvedValue(undefined),
  stopScreenShare: vi.fn().mockResolvedValue(undefined)
}))

const micActivationMock = vi.hoisted(() => ({
  init: vi.fn(),
  destroy: vi.fn(),
  getMode: vi.fn(() => 'live'),
  getPttKey: vi.fn(() => 'Space'),
  setMode: vi.fn(),
  saveSettings: vi.fn(),
  setManualMute: vi.fn()
}))

const microphonePermissionMock = vi.hoisted(() => ({
  requestMicrophonePermission: vi.fn().mockResolvedValue({
    granted: true,
    status: 'granted'
  })
}))

const sfxMock = vi.hoisted(() => ({
  playSfx: vi.fn(),
  SFX_EVENTS: {
    VOICE_JOIN_SELF: 'voice_join_self',
    VOICE_LEAVE_SELF: 'voice_leave_self',
    ERROR_VOICE_CALL: 'error_voice_call'
  }
}))

const sessionStoreMock = vi.hoisted(() => ({
  user: {
    id: 'user-self',
    display_name: 'Self User',
    meeting_video_preferences: {
      background_mode: 'none',
      preferred_camera_device_id: null
    }
  },
  primeUsers: vi.fn()
}))

const channelsStoreMock = vi.hoisted(() => ({
  channels: []
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock
}))

vi.mock('../../src/lib/livekit.js', () => livekitMock)

vi.mock('../../src/lib/mic-activation.js', () => micActivationMock)

vi.mock('../../src/lib/microphone-permission.js', () => microphonePermissionMock)

vi.mock('../../src/lib/sfx.js', () => sfxMock)

vi.mock('../../src/stores/session.js', () => ({
  useSessionStore: () => sessionStoreMock
}))

vi.mock('../../src/stores/channels.js', () => ({
  useChannelsStore: () => channelsStoreMock
}))

describe('voice store reconnect behavior', () => {
  beforeEach(() => {
    apiMock.get.mockReset()
    apiMock.post.mockReset()
    apiMock.patch.mockReset()
    apiMock.delete.mockReset()

    livekitMock.connectToRoom.mockReset()
    livekitMock.connectToRoom.mockResolvedValue(undefined)
    livekitMock.applyScreenShareViewQuality.mockReset()
    livekitMock.disconnectFromRoom.mockReset()
    livekitMock.disconnectFromRoom.mockResolvedValue(undefined)
    livekitMock.getActiveVideoInputDevice.mockReset()
    livekitMock.getActiveVideoInputDevice.mockReturnValue(null)
    livekitMock.getVideoInputDevices.mockReset()
    livekitMock.getVideoInputDevices.mockResolvedValue([])
    livekitMock.hasBackgroundBlurEnabled.mockReset()
    livekitMock.hasBackgroundBlurEnabled.mockReturnValue(false)
    livekitMock.isBackgroundBlurSupported.mockReset()
    livekitMock.isBackgroundBlurSupported.mockReturnValue(true)
    livekitMock.isModernBackgroundBlurSupported.mockReset()
    livekitMock.isModernBackgroundBlurSupported.mockReturnValue(true)
    livekitMock.setCallbacks.mockReset()
    livekitMock.setBackgroundBlurEnabled.mockReset()
    livekitMock.setBackgroundBlurEnabled.mockResolvedValue(undefined)
    livekitMock.setRemoteCameraSubscription.mockReset()
    livekitMock.setDeafened.mockReset()
    livekitMock.setMasterVolume.mockReset()
    livekitMock.setVideoInputDevice.mockReset()
    livekitMock.setVideoInputDevice.mockResolvedValue(undefined)
    livekitMock.startCamera.mockReset()
    livekitMock.startCamera.mockResolvedValue({
      track: { id: 'camera-track-1' },
      publication: { trackSid: 'camera-pub-1' },
      deviceId: null,
      backgroundBlurEnabled: false
    })
    livekitMock.startScreenShare.mockReset()
    livekitMock.startScreenShare.mockResolvedValue({
      track: { id: 'screen-track-1' },
      audioTrack: { id: 'screen-audio-1' },
      hasAudio: true
    })
    livekitMock.stopScreenShare.mockReset()
    livekitMock.stopScreenShare.mockResolvedValue(undefined)
    livekitMock.stopCamera.mockReset()
    livekitMock.stopCamera.mockResolvedValue(undefined)

    micActivationMock.init.mockReset()
    micActivationMock.destroy.mockReset()
    micActivationMock.getMode.mockReset()
    micActivationMock.getMode.mockReturnValue('live')
    micActivationMock.getPttKey.mockReset()
    micActivationMock.getPttKey.mockReturnValue('Space')
    micActivationMock.setMode.mockReset()
    micActivationMock.saveSettings.mockReset()
    micActivationMock.setManualMute.mockReset()
    microphonePermissionMock.requestMicrophonePermission.mockReset()
    microphonePermissionMock.requestMicrophonePermission.mockResolvedValue({
      granted: true,
      status: 'granted'
    })
    sessionStoreMock.user = {
      id: 'user-self',
      display_name: 'Self User',
      meeting_video_preferences: {
        background_mode: 'none',
        preferred_camera_device_id: null
      }
    }
    sessionStoreMock.primeUsers.mockReset()

    sfxMock.playSfx.mockReset()
    channelsStoreMock.channels = []
  })

  it('does not reconnect when already connected in the same channel', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-1'
    store.connected = true
    store.participants = {
      'meeting-channel-1': [{ user_id: 'user-self' }]
    }
    channelsStoreMock.channels = [{
      id: 'meeting-channel-1',
      name: 'meeting-1',
      purpose: 'meeting',
      topic: 'Weekly Sync'
    }]

    await store.reconnectIfNeeded()

    expect(apiMock.post).not.toHaveBeenCalled()
    expect(livekitMock.connectToRoom).not.toHaveBeenCalled()
  })

  it('uses meeting topic as voice display name on reconnect', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-2',
        channelName: 'meeting-channel-2',
        participants: []
      }
    })

    const store = useVoiceStore()
    store.participants = {
      'meeting-channel-2': [{ user_id: 'user-self' }]
    }
    channelsStoreMock.channels = [{
      id: 'meeting-channel-2',
      name: 'meeting-channel-2',
      purpose: 'meeting',
      topic: 'Roadmap Review'
    }]

    await store.reconnectIfNeeded()

    expect(apiMock.post).toHaveBeenCalledWith('/voice', { channel_id: 'meeting-channel-2' })
    expect(store.channelName).toBe('Roadmap Review')
    expect(microphonePermissionMock.requestMicrophonePermission).not.toHaveBeenCalled()
  })

  it('does not reconnect when the same channel is already connecting', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-2'
    store.connecting = true
    store.connected = false
    store.participants = {
      'meeting-channel-2': [{ user_id: 'user-self' }]
    }
    channelsStoreMock.channels = [{
      id: 'meeting-channel-2',
      name: 'meeting-channel-2',
      purpose: 'meeting',
      topic: 'Roadmap Review'
    }]

    await store.reconnectIfNeeded()

    expect(apiMock.post).not.toHaveBeenCalled()
    expect(livekitMock.connectToRoom).not.toHaveBeenCalled()
  })

  it('uses the active voice channel as reconnect fallback when participant cache lost the self entry', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-4',
        channelName: 'meeting-channel-4',
        participants: []
      }
    })

    const store = useVoiceStore()
    store.channelId = 'meeting-channel-4'
    store.connected = false
    store.participants = {}
    channelsStoreMock.channels = [{
      id: 'meeting-channel-4',
      name: 'meeting-channel-4',
      purpose: 'meeting',
      topic: 'Fallback Reconnect Meeting'
    }]

    await store.reconnectIfNeeded()

    expect(apiMock.post).toHaveBeenCalledWith('/voice', { channel_id: 'meeting-channel-4' })
    expect(livekitMock.connectToRoom).toHaveBeenCalledWith('voice-token', 'ws://livekit.local')
    expect(store.channelName).toBe('Fallback Reconnect Meeting')
  })

  it('retries voice room connect once when first attempt fails', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-3',
        channelName: 'meeting-channel-3',
        participants: []
      }
    })
    livekitMock.connectToRoom
      .mockRejectedValueOnce(new Error('temporary connect failure'))
      .mockResolvedValueOnce(undefined)

    const store = useVoiceStore()
    await store.join('meeting-channel-3')

    expect(livekitMock.connectToRoom).toHaveBeenCalledTimes(2)
    expect(store.connected).toBe(true)
  })

  it('requests microphone permission before explicit voice joins', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-mic',
        channelName: 'meeting-channel-mic',
        participants: []
      }
    })

    const store = useVoiceStore()
    await store.join('meeting-channel-mic')

    expect(microphonePermissionMock.requestMicrophonePermission).toHaveBeenCalledOnce()
    expect(livekitMock.connectToRoom).toHaveBeenCalledWith('voice-token', 'ws://livekit.local')
    expect(microphonePermissionMock.requestMicrophonePermission.mock.invocationCallOrder[0])
      .toBeLessThan(livekitMock.connectToRoom.mock.invocationCallOrder[0])
  })

  it('continues listen-only and warns when microphone permission is denied', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-listen-only',
        channelName: 'meeting-channel-listen-only',
        participants: []
      }
    })
    microphonePermissionMock.requestMicrophonePermission.mockResolvedValueOnce({
      granted: false,
      status: 'denied'
    })

    const store = useVoiceStore()
    await store.join('meeting-channel-listen-only')

    expect(livekitMock.connectToRoom).toHaveBeenCalledWith('voice-token', 'ws://livekit.local')
    expect(store.connected).toBe(true)
    expect(store.muted).toBe(true)
    expect(store.manualMuted).toBe(true)
    expect(store.transmitting).toBe(false)
    expect(micActivationMock.setManualMute).toHaveBeenCalledWith(true)
    expect(window.$message.warning).toHaveBeenCalledWith(
      'Microphone permission was not granted. You are joining the call listen-only.'
    )
  })

  it('leave cancels a pending connect so stale success cannot restore voice state', async () => {
    let resolveConnect
    livekitMock.connectToRoom.mockImplementationOnce(() => new Promise((resolve) => {
      resolveConnect = resolve
    }))
    apiMock.delete.mockResolvedValueOnce({ data: { left: true } })

    const store = useVoiceStore()
    const connectPromise = store.connectWithPayload({
      token: 'voice-token',
      url: 'ws://livekit.local',
      channelId: 'meeting-channel-5',
      channelName: 'Weekly Sync',
      participants: [{ user_id: 'user-self' }]
    })

    expect(store.connecting).toBe(true)
    expect(store.channelId).toBe('meeting-channel-5')

    await store.leave()

    expect(store.channelId).toBeNull()
    expect(store.connecting).toBe(false)
    expect(store.connected).toBe(false)

    resolveConnect()

    await expect(connectPromise).resolves.toBe(false)
    expect(store.channelId).toBeNull()
    expect(store.connecting).toBe(false)
    expect(store.connected).toBe(false)
    expect(store.participants['meeting-channel-5']).toEqual([])
  })

  it('startScreenShare stores the local presenter and optional audio state', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-6'
    store.connected = true

    const result = await store.startScreenShare({ audio: true })

    expect(livekitMock.startScreenShare).toHaveBeenCalledWith({ audio: true, qualityProfile: 'balanced' })
    expect(result.hasAudio).toBe(true)
    expect(store.isSharingScreen).toBe(true)
    expect(store.activeScreenShare).toEqual(expect.objectContaining({
      participantId: 'user-self',
      isLocal: true,
      hasAudio: true,
      qualityProfile: 'balanced'
    }))
  })

  it('startCamera blocks when meeting video is disabled by the join payload', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-video-disabled'
    store.connected = true
    store.meetingVideoEnabled = false

    await expect(store.startCamera()).rejects.toThrow('Meeting video is disabled')
    expect(livekitMock.startCamera).not.toHaveBeenCalled()
  })

  it('startCamera publishes a local camera track and patches participant video state', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-video'
    store.connected = true
    store.meetingVideoEnabled = true
    store.participants = {
      'meeting-channel-video': [{ user_id: 'user-self', is_video_enabled: false }]
    }

    await store.startCamera()

    expect(livekitMock.startCamera).toHaveBeenCalledOnce()
    expect(apiMock.patch).toHaveBeenCalledWith('/voice/meeting-channel-video', { is_video_enabled: true })
    expect(store.cameraEnabled).toBe(true)
    expect(store.currentCameraTracks).toEqual([expect.objectContaining({
      participantId: 'user-self',
      isLocal: true,
      track: { id: 'camera-track-1' }
    })])
    expect(store.participants['meeting-channel-video'][0].is_video_enabled).toBe(true)
  })

  it('startCamera uses the preferred camera device and applies blur when configured', async () => {
    sessionStoreMock.user.meeting_video_preferences = {
      background_mode: 'blur',
      preferred_camera_device_id: 'camera-front'
    }
    livekitMock.getVideoInputDevices.mockResolvedValueOnce([
      { deviceId: 'camera-front', label: 'Front Camera' },
      { deviceId: 'camera-rear', label: 'Rear Camera' }
    ])
    livekitMock.startCamera.mockResolvedValueOnce({
      track: { id: 'camera-track-front' },
      publication: { trackSid: 'camera-pub-front' },
      deviceId: 'camera-front',
      backgroundBlurEnabled: true,
      virtualBackgroundImageUrl: null
    })

    const store = useVoiceStore()
    store.channelId = 'meeting-channel-video-preferred'
    store.connected = true
    store.meetingVideoEnabled = true
    store.participants = {
      'meeting-channel-video-preferred': [{ user_id: 'user-self', is_video_enabled: false }]
    }

    await store.startCamera()

expect(livekitMock.startCamera).toHaveBeenCalledWith({
deviceId: 'camera-front',
backgroundBlurEnabled: true,
virtualBackgroundImageUrl: null
})
    expect(store.backgroundBlurApplied).toBe(true)
    expect(store.activeCameraDeviceId).toBe('camera-front')
  })

  it('startCamera falls back to the browser default camera when the preferred device is missing', async () => {
    sessionStoreMock.user.meeting_video_preferences = {
      background_mode: 'none',
      preferred_camera_device_id: 'camera-missing'
    }
    livekitMock.getVideoInputDevices.mockResolvedValueOnce([
      { deviceId: 'camera-front', label: 'Front Camera' }
    ])

    const store = useVoiceStore()
    store.channelId = 'meeting-channel-video-fallback'
    store.connected = true
    store.meetingVideoEnabled = true
    store.participants = {
      'meeting-channel-video-fallback': [{ user_id: 'user-self', is_video_enabled: false }]
    }

    await store.startCamera()

    expect(livekitMock.startCamera).toHaveBeenCalledWith({
      deviceId: null,
      backgroundBlurEnabled: false,
      virtualBackgroundImageUrl: null
    })
  })

  it('startCamera requests explicit confirmation when blur is configured but unsupported', async () => {
    sessionStoreMock.user.meeting_video_preferences = {
      background_mode: 'blur',
      preferred_camera_device_id: null
    }
    livekitMock.isBackgroundBlurSupported.mockReturnValueOnce(false)

    const store = useVoiceStore()
    store.channelId = 'meeting-channel-video-confirm'
    store.connected = true
    store.meetingVideoEnabled = true

    await expect(store.startCamera()).rejects.toMatchObject({
      code: 'MEETING_BACKGROUND_BLUR_CONFIRMATION_REQUIRED'
    })
    expect(livekitMock.startCamera).not.toHaveBeenCalled()
  })

  it('setBackgroundBlurEnabled applies blur immediately for an active local camera track', async () => {
    livekitMock.hasBackgroundBlurEnabled.mockReturnValue(true)

    const store = useVoiceStore()
    store.connected = true
    store.cameraEnabled = true

    const result = await store.setBackgroundBlurEnabled(true)

    expect(livekitMock.setBackgroundBlurEnabled).toHaveBeenCalledWith(true)
    expect(result).toBe(true)
    expect(store.backgroundBlurApplied).toBe(true)
  })

  it('startScreenShare uses the saved publish quality preference by default', async () => {
    localStorage.setItem('screenSharePublishQuality', 'sharp')

    const store = useVoiceStore()
    store.channelId = 'meeting-channel-quality-1'
    store.connected = true

    await store.startScreenShare({ audio: false })

    expect(store.screenSharePublishQuality).toBe('sharp')
    expect(livekitMock.startScreenShare).toHaveBeenCalledWith({ audio: false, qualityProfile: 'sharp' })
  })

  it('startScreenShare blocks when another participant is already presenting', async () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-7'
    store.connected = true
    store.screenSharesByChannel = {
      'meeting-channel-7': [{
        participantId: 'user-other',
        participantName: 'Other User',
        isLocal: false,
        hasAudio: false
      }]
    }

    await expect(store.startScreenShare({ audio: false })).rejects.toThrow('A screen share is already active')
    expect(livekitMock.startScreenShare).not.toHaveBeenCalled()
  })

  it('leave stops an active local screen share before disconnecting voice', async () => {
    apiMock.delete.mockResolvedValueOnce({ data: { left: true } })
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-8'
    store.connected = true
    store.screenSharesByChannel = {
      'meeting-channel-8': [{
        participantId: 'user-self',
        participantName: 'Self User',
        isLocal: true,
        hasAudio: true
      }]
    }

    await store.leave()

    expect(livekitMock.stopScreenShare).toHaveBeenCalledTimes(1)
    expect(store.screenSharesByChannel['meeting-channel-8']).toEqual([])
  })

  it('livekit screen share callbacks update current meeting state', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-9',
        channelName: 'Weekly Sync',
        participants: [{ user_id: 'user-self' }]
      }
    })
    const store = useVoiceStore()
    await store.join('meeting-channel-9')

    const callbacks = livekitMock.setCallbacks.mock.calls.at(-1)?.[0]
    callbacks.onScreenShareStarted({
      participantId: 'user-other',
      participantName: 'Other User',
      track: { id: 'remote-screen-track' },
      publication: { trackSid: 'pub-1' },
      isLocal: false,
      hasAudio: false
    })

    expect(store.activeScreenShare).toEqual(expect.objectContaining({
      participantId: 'user-other',
      participantName: 'Other User',
      isLocal: false,
      publication: { trackSid: 'pub-1' }
    }))
    expect(livekitMock.applyScreenShareViewQuality).toHaveBeenCalledWith(
      { trackSid: 'pub-1' },
      'auto',
      null
    )

    callbacks.onScreenShareStopped({
      participantId: 'user-other'
    })

    expect(store.activeScreenShare).toBeNull()
  })

  it('livekit camera callbacks update current meeting camera state', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        token: 'voice-token',
        url: 'ws://livekit.local',
        channelId: 'meeting-channel-camera-callback',
        channelName: 'Weekly Sync',
        participants: [{ user_id: 'user-self' }],
        features: { meeting_video_enabled: true }
      }
    })
    const store = useVoiceStore()
    await store.join('meeting-channel-camera-callback')

    const callbacks = livekitMock.setCallbacks.mock.calls.at(-1)?.[0]
    callbacks.onCameraStarted({
      participantId: 'user-other',
      participantName: 'Other User',
      track: { id: 'remote-camera-track' },
      publication: { trackSid: 'camera-pub-remote' },
      isLocal: false
    })

    expect(store.currentCameraTracks).toEqual([expect.objectContaining({
      participantId: 'user-other',
      participantName: 'Other User',
      publication: { trackSid: 'camera-pub-remote' }
    })])

    callbacks.onCameraStopped({
      participantId: 'user-other'
    })

    expect(store.currentCameraTracks).toEqual([])
  })

  it('can disable and re-enable all incoming remote camera subscriptions without affecting local camera state', () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-remote-video'
    store.connected = true
    store.meetingVideoEnabled = true
    store.cameraTracksByChannel = {
      'meeting-channel-remote-video': [
        {
          participantId: 'user-self',
          participantName: 'Self User',
          track: { id: 'local-camera-track' },
          publication: { trackSid: 'local-camera-pub' },
          isLocal: true
        },
        {
          participantId: 'user-other',
          participantName: 'Other User',
          track: { id: 'remote-camera-track' },
          publication: { trackSid: 'remote-camera-pub' },
          isLocal: false
        }
      ]
    }

    store.setAllRemoteCameraSubscriptions(false)
    expect(store.allRemoteCameraSubscriptionsEnabled).toBe(false)
    expect(livekitMock.setRemoteCameraSubscription).toHaveBeenCalledWith('user-other', false)
    expect(livekitMock.setRemoteCameraSubscription).not.toHaveBeenCalledWith('user-self', false)

    store.setAllRemoteCameraSubscriptions(true)
    expect(store.allRemoteCameraSubscriptionsEnabled).toBe(true)
    expect(livekitMock.setRemoteCameraSubscription).toHaveBeenCalledWith('user-other', true)
  })

  it('tracks per-participant incoming remote video preferences and preserves them while global incoming video is off', () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-remote-video-2'
    store.connected = true
    store.cameraTracksByChannel = {
      'meeting-channel-remote-video-2': [
        {
          participantId: 'user-other',
          participantName: 'Other User',
          track: { id: 'remote-camera-track-1' },
          publication: { trackSid: 'remote-camera-pub-1' },
          isLocal: false
        },
        {
          participantId: 'user-another',
          participantName: 'Another User',
          track: { id: 'remote-camera-track-2' },
          publication: { trackSid: 'remote-camera-pub-2' },
          isLocal: false
        }
      ]
    }

    store.setRemoteCameraSubscription('user-other', false)
    expect(store.disabledRemoteCameraParticipantIds).toEqual({ 'user-other': true })
    expect(store.isRemoteCameraSubscriptionEnabled('user-other')).toBe(false)
    expect(store.isRemoteCameraSubscriptionEnabled('user-another')).toBe(true)
    expect(livekitMock.setRemoteCameraSubscription).toHaveBeenCalledWith('user-other', false)

    store.setAllRemoteCameraSubscriptions(false)
    expect(store.isRemoteCameraSubscriptionEnabled('user-other')).toBe(false)
    expect(store.isRemoteCameraSubscriptionEnabled('user-another')).toBe(false)

    store.setAllRemoteCameraSubscriptions(true)
    expect(store.isRemoteCameraSubscriptionEnabled('user-other')).toBe(false)
    expect(store.isRemoteCameraSubscriptionEnabled('user-another')).toBe(true)

    store.setRemoteCameraSubscription('user-other', true)
    expect(store.disabledRemoteCameraParticipantIds).toEqual({})
    expect(store.isRemoteCameraSubscriptionEnabled('user-other')).toBe(true)
    expect(livekitMock.setRemoteCameraSubscription).toHaveBeenCalledWith('user-other', true)
  })

  it('resets incoming remote camera subscription state on leave and disconnect', async () => {
    apiMock.delete.mockResolvedValueOnce({ data: { left: true } })
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-remote-video-3'
    store.connected = true
    store.allRemoteCameraSubscriptionsEnabled = false
    store.disabledRemoteCameraParticipantIds = { 'user-other': true }

    await store.leave()

    expect(store.allRemoteCameraSubscriptionsEnabled).toBe(true)
    expect(store.disabledRemoteCameraParticipantIds).toEqual({})

    store.channelId = 'meeting-channel-remote-video-3'
    store.connected = true
    store.allRemoteCameraSubscriptionsEnabled = false
    store.disabledRemoteCameraParticipantIds = { 'user-other': true }

    store.markDisconnected()

    expect(store.allRemoteCameraSubscriptionsEnabled).toBe(true)
    expect(store.disabledRemoteCameraParticipantIds).toEqual({})
  })

  it('keeps screen share viewer state independent from incoming remote camera toggles', () => {
    const publication = { trackSid: 'pub-keep-screen-share' }
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-remote-video-4'
    store.screenSharesByChannel = {
      'meeting-channel-remote-video-4': [{
        participantId: 'user-other',
        participantName: 'Other User',
        publication,
        isLocal: false,
        hasAudio: false
      }]
    }
    store.cameraTracksByChannel = {
      'meeting-channel-remote-video-4': [{
        participantId: 'user-other',
        participantName: 'Other User',
        publication: { trackSid: 'camera-remote-pub' },
        isLocal: false
      }]
    }

    store.setAllRemoteCameraSubscriptions(false)
    store.applyScreenShareViewQuality()

    expect(store.activeScreenShare).toEqual(expect.objectContaining({
      participantId: 'user-other',
      publication
    }))
    expect(livekitMock.applyScreenShareViewQuality).toHaveBeenCalledWith(publication, 'auto', null)
  })

  it('persists viewer quality changes and applies them to the active remote share', () => {
    const publication = { trackSid: 'pub-2' }
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-quality-2'
    store.screenSharesByChannel = {
      'meeting-channel-quality-2': [{
        participantId: 'user-other',
        participantName: 'Other User',
        publication,
        isLocal: false,
        hasAudio: false
      }]
    }

    store.setScreenShareViewQuality('medium')
    store.applyScreenShareViewQuality()

    expect(localStorage.getItem('screenShareViewQuality')).toBe('medium')
    expect(livekitMock.applyScreenShareViewQuality).toHaveBeenCalledWith(publication, 'medium', null)
  })

  it('clearChannelState removes stale participants and shares for a meeting channel', () => {
    const store = useVoiceStore()
    store.channelId = 'meeting-channel-10'
    store.participants = {
      'meeting-channel-10': [{ user_id: 'user-other' }]
    }
    store.screenSharesByChannel = {
      'meeting-channel-10': [{
        participantId: 'user-other',
        participantName: 'Other User',
        isLocal: false,
        hasAudio: false
      }]
    }
    store.pinnedShareParticipantId = 'user-other'
    store.screenShareError = 'stale error'
    store.allRemoteCameraSubscriptionsEnabled = false
    store.disabledRemoteCameraParticipantIds = { 'user-other': true }

    store.clearChannelState('meeting-channel-10')

    expect(store.participants['meeting-channel-10']).toEqual([])
    expect(store.screenSharesByChannel['meeting-channel-10']).toEqual([])
    expect(store.pinnedShareParticipantId).toBeNull()
    expect(store.screenShareError).toBeNull()
    expect(store.allRemoteCameraSubscriptionsEnabled).toBe(true)
    expect(store.disabledRemoteCameraParticipantIds).toEqual({})
  })

  it('persists mic mode changes through mic activation without a direct bridge side effect', () => {
    const store = useVoiceStore()
    store.setMicMode('ptt')

    expect(micActivationMock.setMode).toHaveBeenCalledWith('ptt')
    expect(micActivationMock.saveSettings).toHaveBeenCalledOnce()
  })
})
