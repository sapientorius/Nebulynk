import { Room, RoomEvent, ScreenSharePresets, Track, VideoQuality, createLocalScreenTracks, createLocalVideoTrack } from 'livekit-client'
import { BackgroundBlur, VirtualBackground, supportsBackgroundProcessors, supportsModernBackgroundProcessors } from '@livekit/track-processors'
import {
  DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY,
  DEFAULT_SCREEN_SHARE_VIEW_QUALITY,
  SCREEN_SHARE_PRESET_KEYS,
  normalizeScreenSharePublishQuality,
  normalizeScreenShareViewQuality
} from './screen-share-quality.js'

let room = null
let callbacks = {}
const configuredLivekitUrl = import.meta.env.VITE_LIVEKIT_URL?.trim() || ''
const useFakeLivekit = import.meta.env.VITE_FAKE_LIVEKIT === 'true'
const BACKGROUND_BLUR_ASSET_PATHS = Object.freeze({
  tasksVisionFileSet: '/vendor/mediapipe/tasks-vision/0.10.14/wasm',
  modelAssetPath: '/vendor/mediapipe/models/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
})
let localScreenTracks = []
let localScreenTrackUnsubscribers = []
let localScreenShareActive = false
let localScreenShareActiveQuality = DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY
let localCameraTrack = null
let localCameraBlurEnabled = false
let localCameraVirtualBackgroundUrl = null
const DEFAULT_BACKGROUND_BLUR_RADIUS = 12
const FAKE_VIDEO_INPUT_DEVICES = [
  { deviceId: 'camera-front', label: 'Front Camera', kind: 'videoinput' },
  { deviceId: 'camera-rear', label: 'Rear Camera', kind: 'videoinput' }
]
let activeFakeVideoInputDeviceId = FAKE_VIDEO_INPUT_DEVICES[0].deviceId

function createScreenSharePayload({
  participantId,
  participantName = null,
  track = null,
  publication = null,
  isLocal = false,
  hasAudio = false,
  qualityProfile = null
}) {
  return {
    participantId,
    participantName,
    track,
    publication,
    isLocal,
    hasAudio,
    qualityProfile
  }
}

function createCameraPayload({
  participantId,
  participantName = null,
  track = null,
  publication = null,
  isLocal = false
}) {
  return {
    participantId,
    participantName,
    track,
    publication,
    isLocal
  }
}

function resolveScreenShareResolution(qualityProfile) {
  const normalized = normalizeScreenSharePublishQuality(qualityProfile)
  const presetKey = SCREEN_SHARE_PRESET_KEYS[normalized]
  return ScreenSharePresets[presetKey]?.resolution || ScreenSharePresets.h1080fps15.resolution
}

function measureVideoElement(videoElement) {
  if (!videoElement) return null
  const width = Math.max(Math.round(videoElement.clientWidth || 0), Math.round(videoElement.videoWidth || 0))
  const height = Math.max(Math.round(videoElement.clientHeight || 0), Math.round(videoElement.videoHeight || 0))
  if (!width || !height) return null
  return { width, height }
}

function clearLocalScreenTrackListeners() {
  for (const unsubscribe of localScreenTrackUnsubscribers) {
    try {
      unsubscribe()
    } catch {
      // ignore cleanup errors
    }
  }
  localScreenTrackUnsubscribers = []
}

function emitLocalScreenShareStopped() {
  if (!room?.localParticipant) return
  callbacks.onScreenShareStopped?.(createScreenSharePayload({
    participantId: room.localParticipant.identity,
    participantName: room.localParticipant.name || null,
    isLocal: true,
    qualityProfile: localScreenShareActiveQuality
  }))
}

function cleanupLocalScreenShareState({ emitStopped = false } = {}) {
  clearLocalScreenTrackListeners()
  localScreenTracks = []
  const wasActive = localScreenShareActive
  localScreenShareActive = false
  localScreenShareActiveQuality = DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY
  if (emitStopped && wasActive) {
    emitLocalScreenShareStopped()
  }
}

function isScreenShareVideoTrack(trackPublicationOrTrack, track = null) {
  const source = trackPublicationOrTrack?.source || track?.source
  const kind = track?.kind || trackPublicationOrTrack?.kind
  return source === Track.Source.ScreenShare && kind === Track.Kind.Video
}

function isScreenShareAudioTrack(trackPublicationOrTrack, track = null) {
  const source = trackPublicationOrTrack?.source || track?.source
  const kind = track?.kind || trackPublicationOrTrack?.kind
  return source === Track.Source.ScreenShareAudio && kind === Track.Kind.Audio
}

function isCameraVideoTrack(trackPublicationOrTrack, track = null) {
  const source = trackPublicationOrTrack?.source || track?.source
  const kind = track?.kind || trackPublicationOrTrack?.kind
  return source === Track.Source.Camera && kind === Track.Kind.Video
}

function buildScreenSharePayloadFromParticipant(participant, track = null, publication = null) {
  return createScreenSharePayload({
    participantId: participant?.identity || null,
    participantName: participant?.name || null,
    track,
    publication,
    isLocal: !!participant?.isLocal,
    hasAudio: isScreenShareAudioTrack(publication) || false,
    qualityProfile: participant?.isLocal ? localScreenShareActiveQuality : null
  })
}

function buildCameraPayloadFromParticipant(participant, track = null, publication = null) {
  return createCameraPayload({
    participantId: participant?.identity || null,
    participantName: participant?.name || null,
    track,
    publication,
    isLocal: !!participant?.isLocal
  })
}

function getParticipantCameraPublication(participant) {
  return participant?.getTrackPublication?.(Track.Source.Camera) || null
}

async function detachTrackElements(track) {
  if (!track?.detach) return
  const elements = track.detach()
  if (Array.isArray(elements)) {
    elements.forEach((element) => element?.remove?.())
  }
}

function createFakeRoom() {
  const fakeTrack = {
    isMuted: false,
    mute() {
      this.isMuted = true
    },
    unmute() {
      this.isMuted = false
    }
  }

  const fakePublication = {
    get isMuted() {
      return fakeTrack.isMuted
    },
    track: fakeTrack
  }
  const fakeCameraTrack = {
    kind: Track.Kind.Video,
    source: Track.Source.Camera,
    processor: null,
    attach(videoElement) {
      return videoElement || document.createElement('video')
    },
    detach() {
      return []
    },
    stop() {},
    async setProcessor(processor) {
      this.processor = processor
    },
    async stopProcessor() {
      this.processor = null
    },
    getProcessor() {
      return this.processor
    }
  }
  const fakeCameraPublication = {
    source: Track.Source.Camera,
    kind: Track.Kind.Video,
    get track() {
      return localCameraTrack
    }
  }

  return {
    state: 'connected',
    remoteParticipants: new Map(),
    on() {},
    async connect() {},
    async disconnect() {},
    async switchActiveDevice(kind, deviceId) {
      if (kind !== 'videoinput' || !deviceId) return
      activeFakeVideoInputDeviceId = deviceId
    },
    getActiveDevice(kind) {
      if (kind !== 'videoinput') return null
      return activeFakeVideoInputDeviceId
    },
    localParticipant: {
      identity: 'fake-user',
      name: 'Fake User',
      async setMicrophoneEnabled(enabled) {
        fakeTrack.isMuted = !enabled
      },
      async setCameraEnabled(enabled) {
        if (enabled) {
          localCameraTrack = {
            ...fakeCameraTrack,
          processor: localCameraVirtualBackgroundUrl
            ? { name: 'fake-virtual-background', imagePath: localCameraVirtualBackgroundUrl }
            : localCameraBlurEnabled
              ? (fakeCameraTrack.processor || { name: 'fake-background-blur' })
              : null
          }
        } else {
          localCameraTrack = null
        localCameraBlurEnabled = false
        localCameraVirtualBackgroundUrl = null
        }
      },
      async publishTrack() {},
      async unpublishTrack() {},
      getTrackPublication(source) {
        if (source === Track.Source.Camera && localCameraTrack) return fakeCameraPublication
        if (source !== Track.Source.Microphone) return null
        return fakePublication
      }
    }
  }
}

function toWsUrl(url) {
  const value = (url || '').trim()
  if (!value) return ''
  if (value.startsWith('ws://') || value.startsWith('wss://')) return value
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.replace(/^http/, 'ws')
  }
  return `wss://${value}`
}

function isInternalHost(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === 'livekit' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function resolveServerUrl(serverUrl) {
  const normalized = toWsUrl(serverUrl)
  const fallback = toWsUrl(configuredLivekitUrl)
  if (!normalized) return fallback
  if (isInternalHost(normalized) && fallback) return fallback
  return normalized
}

function getLocalCameraPublication() {
  if (!room?.localParticipant) return null
  return room.localParticipant.getTrackPublication(Track.Source.Camera) || null
}

function getLocalCameraVideoTrack() {
  const publication = getLocalCameraPublication()
  return publication?.track || localCameraTrack || null
}

export function isBackgroundBlurSupported() {
  if (useFakeLivekit) return true
  try {
    return supportsBackgroundProcessors()
  } catch {
    return false
  }
}

export function isModernBackgroundBlurSupported() {
  if (useFakeLivekit) return true
  try {
    return supportsModernBackgroundProcessors()
  } catch {
    return false
  }
}

function createBackgroundBlurProcessor() {
  return BackgroundBlur(
    DEFAULT_BACKGROUND_BLUR_RADIUS,
    undefined,
    undefined,
    { assetPaths: BACKGROUND_BLUR_ASSET_PATHS }
  )
}

function createVirtualBackgroundProcessor(imageUrl) {
  return VirtualBackground(
    imageUrl,
    undefined,
    undefined,
    { assetPaths: BACKGROUND_BLUR_ASSET_PATHS }
  )
}

async function stopVideoTrackProcessor(track) {
  if (track?.getProcessor?.()) {
    await track.stopProcessor?.()
  }
}

async function applyBackgroundProcessorToTrack(track, { backgroundBlurEnabled = false, virtualBackgroundImageUrl = null } = {}) {
  if (!track) return false

  if (virtualBackgroundImageUrl) {
    if (!isBackgroundBlurSupported()) {
      throw new Error('Virtual background is not supported in this browser')
    }
    await stopVideoTrackProcessor(track)
    await track.setProcessor?.(createVirtualBackgroundProcessor(virtualBackgroundImageUrl))
    return true
  }

  if (backgroundBlurEnabled) {
    if (!isBackgroundBlurSupported()) {
      throw new Error('Background blur is not supported in this browser')
    }
    await stopVideoTrackProcessor(track)
    await track.setProcessor?.(createBackgroundBlurProcessor())
    return true
  }

  await stopVideoTrackProcessor(track)
  return false
}

function createFakePreviewTrack({ backgroundBlurEnabled = false, virtualBackgroundImageUrl = null } = {}) {
  let processor = virtualBackgroundImageUrl
    ? { name: 'fake-virtual-background', imagePath: virtualBackgroundImageUrl }
    : backgroundBlurEnabled
      ? { name: 'fake-background-blur' }
      : null

  return {
    attach(videoElement) {
      return videoElement || document.createElement('video')
    },
    detach() {
      return []
    },
    stop() {},
    mediaStreamTrack: {
      stop() {}
    },
    async setProcessor(nextProcessor) {
      processor = nextProcessor
    },
    async stopProcessor() {
      processor = null
    },
    getProcessor() {
      return processor
    }
  }
}

export async function createLocalCameraPreview(options = {}) {
  const {
    deviceId = null,
    backgroundBlurEnabled = false,
    virtualBackgroundImageUrl = null
  } = options

  const track = useFakeLivekit
    ? createFakePreviewTrack({ backgroundBlurEnabled, virtualBackgroundImageUrl })
    : await createLocalVideoTrack(deviceId ? { deviceId: { exact: deviceId } } : undefined)

  await applyBackgroundProcessorToTrack(track, {
    backgroundBlurEnabled,
    virtualBackgroundImageUrl
  })

  return track
}

export async function stopLocalCameraPreview(track, videoElement = null) {
  if (!track) return

  try {
    await stopVideoTrackProcessor(track)
  } catch {
    // Preview teardown should continue even if processor cleanup fails.
  }

  try {
    if (videoElement) {
      track.detach?.(videoElement)
    } else {
      const elements = track.detach?.()
      if (Array.isArray(elements)) {
        elements.forEach((element) => element?.remove?.())
      }
    }
  } catch {
    // Ignore detach errors during preview cleanup.
  }

  try {
    track.stop?.()
    track.mediaStreamTrack?.stop?.()
  } catch {
    // Ignore camera stop errors during preview cleanup.
  }
}

async function setLocalCameraBackgroundBlurEnabled(enabled, options = {}) {
  const { suppressErrors = false } = options
  const track = getLocalCameraVideoTrack()

  if (!track) {
    localCameraBlurEnabled = false
    return false
  }

  try {
    if (enabled) {
      if (!isBackgroundBlurSupported()) {
        throw new Error('Background blur is not supported in this browser')
      }
      await applyBackgroundProcessorToTrack(track, { backgroundBlurEnabled: true })
      localCameraBlurEnabled = true
      localCameraVirtualBackgroundUrl = null
      return true
    }

    await applyBackgroundProcessorToTrack(track)
    localCameraBlurEnabled = false
    localCameraVirtualBackgroundUrl = null
    return true
  } catch (error) {
    if (!suppressErrors) {
      throw error
    }
    localCameraBlurEnabled = false
    return false
  }
}

async function setLocalCameraVirtualBackgroundImage(imageUrl, options = {}) {
  const { suppressErrors = false } = options
  const track = getLocalCameraVideoTrack()

  if (!track) {
    localCameraVirtualBackgroundUrl = imageUrl || null
    localCameraBlurEnabled = false
    return false
  }

  try {
    if (imageUrl) {
      if (!isBackgroundBlurSupported()) {
        throw new Error('Virtual background is not supported in this browser')
      }
      await applyBackgroundProcessorToTrack(track, { virtualBackgroundImageUrl: imageUrl })
      localCameraBlurEnabled = false
      localCameraVirtualBackgroundUrl = imageUrl
      return true
    }

    await applyBackgroundProcessorToTrack(track)
    localCameraBlurEnabled = false
    localCameraVirtualBackgroundUrl = null
    return true
  } catch (error) {
    if (!suppressErrors) {
      throw error
    }
    localCameraVirtualBackgroundUrl = null
    localCameraBlurEnabled = false
    return false
  }
}

function syncExistingRemoteMediaState() {
  if (!room?.remoteParticipants) return

  for (const [, participant] of room.remoteParticipants) {
    const cameraPublication = getParticipantCameraPublication(participant)
    if (cameraPublication) {
      callbacks.onCameraPublished?.(
        buildCameraPayloadFromParticipant(participant, cameraPublication.track || null, cameraPublication)
      )
      if (cameraPublication.track) {
        callbacks.onCameraStarted?.(
          buildCameraPayloadFromParticipant(participant, cameraPublication.track, cameraPublication)
        )
      }
    }
  }
}

export function setCallbacks(cbs) {
  callbacks = cbs
}

export function getRoom() {
  return room
}

export function isConnected() {
  return room?.state === 'connected'
}

export async function connectToRoom(token, serverUrl) {
  if (useFakeLivekit) {
    if (room) {
      await disconnectFromRoom({ suppressErrors: true })
    }
    room = createFakeRoom()
    callbacks.onActiveSpeakersChanged?.([])
    return
  }

  // Disconnect existing room if any
  if (room) {
    await disconnectFromRoom({ suppressErrors: true })
  }

  room = new Room({
    adaptiveStream: true,
    dynacast: true
  })

  // Set up event listeners
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    callbacks.onParticipantConnected?.(participant)
  })

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    callbacks.onParticipantDisconnected?.(participant)
  })

  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (isScreenShareVideoTrack(publication, track)) {
      callbacks.onScreenShareStarted?.(buildScreenSharePayloadFromParticipant(participant, track, publication))
      return
    }

    if (isCameraVideoTrack(publication, track)) {
      callbacks.onCameraStarted?.(buildCameraPayloadFromParticipant(participant, track, publication))
      return
    }

    if (track.kind === Track.Kind.Audio) {
      // Auto-attach remote audio
      const audioElement = track.attach()
      audioElement.id = `audio-${participant.identity}`
      document.body.appendChild(audioElement)
    }
  })

  room.on(RoomEvent.TrackPublished, (publication, participant) => {
    if (isCameraVideoTrack(publication, publication?.track)) {
      callbacks.onCameraPublished?.(
        buildCameraPayloadFromParticipant(participant, publication?.track || null, publication)
      )
    }
  })

  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (isScreenShareVideoTrack(publication, track)) {
      detachTrackElements(track).catch(() => {})
      callbacks.onScreenShareStopped?.(buildScreenSharePayloadFromParticipant(participant, null, publication))
      return
    }

    if (isCameraVideoTrack(publication, track)) {
      detachTrackElements(track).catch(() => {})
      callbacks.onCameraStopped?.(buildCameraPayloadFromParticipant(participant, null, publication))
      return
    }

    if (track.kind === Track.Kind.Audio) {
      const elements = track.detach()
      elements.forEach((el) => el.remove())
    }
  })

  room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
    if (isCameraVideoTrack(publication, publication?.track)) {
      callbacks.onCameraUnpublished?.(
        buildCameraPayloadFromParticipant(participant, null, publication)
      )
    }
  })

  room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
    const speakerIds = speakers.map((s) => s.identity)
    callbacks.onActiveSpeakersChanged?.(speakerIds)
  })

  room.on(RoomEvent.TrackMuted, (publication, participant) => {
    if (isCameraVideoTrack(publication)) {
      callbacks.onCameraStopped?.(buildCameraPayloadFromParticipant(participant, null, publication))
      return
    }
    callbacks.onTrackMuted?.(participant.identity)
  })

  room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
    if (isCameraVideoTrack(publication, publication?.track)) {
      callbacks.onCameraStarted?.(buildCameraPayloadFromParticipant(participant, publication?.track || null, publication))
      return
    }
    callbacks.onTrackUnmuted?.(participant.identity)
  })

  room.on(RoomEvent.Disconnected, () => {
    localCameraTrack = null
    localCameraBlurEnabled = false
    cleanupLocalScreenShareState({ emitStopped: true })
    callbacks.onDisconnected?.()
  })

  // Connect and enable microphone
  const resolvedUrl = resolveServerUrl(serverUrl)
  if (!resolvedUrl) {
    throw new Error('Keine LiveKit-URL konfiguriert')
  }
  await room.connect(resolvedUrl, token)
  syncExistingRemoteMediaState()
  try {
    await room.localParticipant.setMicrophoneEnabled(true)
  } catch (error) {
    // Joining the room succeeded; keep listen-only mode when mic activation fails.
    console.warn('[Voice] Microphone activation failed, continuing in listen-only mode:', error)
  }
}

export async function disconnectFromRoom(options = {}) {
  const { suppressErrors = false } = options
  if (!room) return

  await stopScreenShare({ suppressErrors: true, skipCallback: true })
  await stopCamera({ suppressErrors: true, skipCallback: true })

  if (useFakeLivekit) {
    room = null
    localCameraTrack = null
    localCameraBlurEnabled = false
    cleanupLocalScreenShareState()
    callbacks.onDisconnected?.()
    return
  }

  let disconnectError = null
  try {
    await room.disconnect(true)
  } catch (error) {
    disconnectError = error
    if (!suppressErrors) {
      throw error
    }
    console.warn('[Voice] Room disconnect failed during handover:', error)
  } finally {
    room = null
    localCameraTrack = null
    localCameraBlurEnabled = false
    cleanupLocalScreenShareState()
    if (disconnectError) {
      callbacks.onDisconnected?.()
    }
  }
}

export async function toggleMute() {
  if (!room) return false
  // Use track-level mute/unmute to keep MediaStreamTrack alive (important for VAD)
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  if (!pub?.track) return false
  if (pub.isMuted) {
    await pub.track.unmute()
  } else {
    await pub.track.mute()
  }
  return !pub.isMuted
}

// Get the local microphone track (used by mic-activation.js for VAD/PTT)
export function getMicTrack() {
  if (!room) return null
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  return pub?.track || null
}

export async function startCamera(options = {}) {
  const {
    deviceId = null,
    backgroundBlurEnabled = false,
    virtualBackgroundImageUrl = null
  } = options
  if (!room) {
    throw new Error('Not connected to a room')
  }

  if (deviceId) {
    await setVideoInputDevice(deviceId)
  }

  await room.localParticipant.setCameraEnabled(true)
  const publication = getLocalCameraPublication()
  const track = publication?.track || null
  localCameraTrack = track

  try {
    if (virtualBackgroundImageUrl) {
      await setLocalCameraVirtualBackgroundImage(virtualBackgroundImageUrl, { suppressErrors: false })
    } else {
      await setLocalCameraBackgroundBlurEnabled(backgroundBlurEnabled, { suppressErrors: false })
    }
  } catch (error) {
    localCameraTrack = null
    await room.localParticipant.setCameraEnabled(false)
    throw error
  }

  callbacks.onCameraStarted?.(createCameraPayload({
    participantId: room.localParticipant.identity,
    participantName: room.localParticipant.name || null,
    track,
    publication,
    isLocal: true
  }))
  return {
    track,
    publication,
    deviceId: getActiveVideoInputDevice(),
    backgroundBlurEnabled: localCameraBlurEnabled,
    virtualBackgroundImageUrl: localCameraVirtualBackgroundUrl
  }
}

export async function stopCamera(options = {}) {
  const { suppressErrors = false, skipCallback = false } = options
  if (!room?.localParticipant) {
    localCameraTrack = null
    return
  }

  const publication = getLocalCameraPublication()
  const track = publication?.track || localCameraTrack

  try {
    await setLocalCameraBackgroundBlurEnabled(false, { suppressErrors: true })
    await room.localParticipant.setCameraEnabled(false)
  } catch (error) {
    if (!suppressErrors) {
      throw error
    }
  } finally {
    if (track) {
      await detachTrackElements(track)
    }
  localCameraTrack = null
  localCameraBlurEnabled = false
  localCameraVirtualBackgroundUrl = null
    if (!skipCallback) {
      callbacks.onCameraStopped?.(createCameraPayload({
        participantId: room.localParticipant.identity,
        participantName: room.localParticipant.name || null,
        publication,
        isLocal: true
      }))
      callbacks.onCameraUnpublished?.(createCameraPayload({
        participantId: room.localParticipant.identity,
        participantName: room.localParticipant.name || null,
        publication,
        isLocal: true
      }))
    }
  }
}

export function setRemoteCameraSubscription(participantId, enabled) {
  if (!room?.remoteParticipants || !participantId) return false

  for (const [, participant] of room.remoteParticipants) {
    if (participant.identity !== participantId) continue
    const publication = getParticipantCameraPublication(participant)
    if (!publication || typeof publication.setSubscribed !== 'function') return false
    publication.setSubscribed(enabled)
    return true
  }

  return false
}

export function hasActiveCamera() {
  return !!localCameraTrack || !!getLocalCameraPublication()
}

export function hasBackgroundBlurEnabled() {
  return localCameraBlurEnabled
}

export async function setBackgroundBlurEnabled(enabled) {
  return setLocalCameraBackgroundBlurEnabled(enabled)
}

export function hasVirtualBackgroundEnabled() {
  return !!localCameraVirtualBackgroundUrl
}

export async function setVirtualBackgroundImage(imageUrl) {
  return setLocalCameraVirtualBackgroundImage(imageUrl)
}

export function getScreenShareTracks() {
  return [...localScreenTracks]
}

export function hasActiveScreenShare() {
  return localScreenShareActive
}

export function getScreenShareCaptureOptions(qualityProfile = DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY) {
  const normalized = normalizeScreenSharePublishQuality(qualityProfile)
  return {
    qualityProfile: normalized,
    resolution: resolveScreenShareResolution(normalized)
  }
}

export function applyScreenShareViewQuality(publication, quality = DEFAULT_SCREEN_SHARE_VIEW_QUALITY, videoElement = null) {
  if (!publication || typeof publication.setVideoQuality !== 'function') return

  const normalized = normalizeScreenShareViewQuality(quality)
  if (normalized === 'high') {
    publication.setVideoQuality(VideoQuality.HIGH)
    return
  }
  if (normalized === 'medium') {
    publication.setVideoQuality(VideoQuality.MEDIUM)
    return
  }
  if (normalized === 'low') {
    publication.setVideoQuality(VideoQuality.LOW)
    return
  }

  const measured = measureVideoElement(videoElement)
  if (measured && typeof publication.setVideoDimensions === 'function') {
    publication.setVideoDimensions(measured)
    return
  }

  publication.setVideoQuality(VideoQuality.HIGH)
}

export async function startScreenShare(options = {}) {
  const {
    audio = false,
    qualityProfile = DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY
  } = options
  if (!room) {
    throw new Error('Not connected to a room')
  }

  if (localScreenShareActive) {
    throw new Error('Screen share is already active')
  }

  const captureOptions = getScreenShareCaptureOptions(qualityProfile)
  const tracks = await createLocalScreenTracks({
    audio,
    resolution: captureOptions.resolution
  })

  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error('No screen share tracks returned')
  }

  localScreenTracks = tracks
  localScreenShareActive = true
  localScreenShareActiveQuality = captureOptions.qualityProfile
  clearLocalScreenTrackListeners()

  for (const track of tracks) {
    await room.localParticipant.publishTrack(track)
  }

  const videoTrack = tracks.find((track) => track.source === Track.Source.ScreenShare) || null
  const audioTrack = tracks.find((track) => track.source === Track.Source.ScreenShareAudio) || null

  for (const track of tracks) {
    const mediaStreamTrack = track?.mediaStreamTrack
    if (!mediaStreamTrack || typeof mediaStreamTrack.addEventListener !== 'function') continue

    const onEnded = () => {
      stopScreenShare({ suppressErrors: true }).catch(() => {})
    }
    mediaStreamTrack.addEventListener('ended', onEnded, { once: true })
    localScreenTrackUnsubscribers.push(() => {
      mediaStreamTrack.removeEventListener?.('ended', onEnded)
    })
  }

  callbacks.onScreenShareStarted?.(createScreenSharePayload({
    participantId: room.localParticipant.identity,
    participantName: room.localParticipant.name || null,
    track: videoTrack,
    isLocal: true,
    hasAudio: !!audioTrack,
    qualityProfile: captureOptions.qualityProfile
  }))

  return {
    track: videoTrack,
    audioTrack,
    hasAudio: !!audioTrack,
    qualityProfile: captureOptions.qualityProfile
  }
}

export async function stopScreenShare(options = {}) {
  const { suppressErrors = false, skipCallback = false } = options
  if (!room || localScreenTracks.length === 0) {
    cleanupLocalScreenShareState()
    return
  }

  const tracksToStop = [...localScreenTracks]

  try {
    for (const track of tracksToStop) {
      try {
        await room.localParticipant.unpublishTrack(track)
      } catch (error) {
        if (!suppressErrors) {
          throw error
        }
      }

      try {
        track.stop?.()
      } catch (error) {
        if (!suppressErrors) {
          throw error
        }
      }

      await detachTrackElements(track)
    }
  } finally {
    cleanupLocalScreenShareState({ emitStopped: !skipCallback })
  }
}

export function setDeafened(deafened) {
  if (!room) return
  // Deafen = set all remote participants volume to 0
  for (const [, participant] of room.remoteParticipants) {
    participant.setVolume(deafened ? 0 : 1)
  }
}

// === Audio Device Management ===

export async function getAudioInputDevices() {
  if (useFakeLivekit) return []
  return await Room.getLocalDevices('audioinput')
}

export async function getVideoInputDevices() {
  if (useFakeLivekit) return [...FAKE_VIDEO_INPUT_DEVICES]
  return await Room.getLocalDevices('videoinput')
}

export async function getAudioOutputDevices() {
  if (useFakeLivekit) return []
  return await Room.getLocalDevices('audiooutput')
}

export async function setAudioInputDevice(deviceId) {
  if (useFakeLivekit) return
  if (!room) return
  await room.switchActiveDevice('audioinput', deviceId)
}

export async function setVideoInputDevice(deviceId) {
  if (useFakeLivekit) {
    if (deviceId) {
      activeFakeVideoInputDeviceId = deviceId
    }
    return
  }
  if (!room || !deviceId) return
  await room.switchActiveDevice('videoinput', deviceId)
}

export async function setAudioOutputDevice(deviceId) {
  if (useFakeLivekit) return
  if (!room) return
  await room.switchActiveDevice('audiooutput', deviceId)
}

// Set master volume for all remote participants (0.0 - 1.0)
export function setMasterVolume(volume) {
  if (!room) return
  for (const [, participant] of room.remoteParticipants) {
    participant.setVolume(volume)
  }
}

// Get active input device ID
export function getActiveAudioInputDevice() {
  if (useFakeLivekit) return null
  if (!room) return null
  return room.getActiveDevice('audioinput')
}

export function getActiveVideoInputDevice() {
  if (useFakeLivekit) return activeFakeVideoInputDeviceId
  if (!room) return null
  return room.getActiveDevice('videoinput')
}

// Get active output device ID
export function getActiveAudioOutputDevice() {
  if (useFakeLivekit) return null
  if (!room) return null
  return room.getActiveDevice('audiooutput')
}
