export const AVATAR_CAMERA_MIME_TYPE = 'image/webp'

export function isAvatarCameraSupported(mediaDevices = globalThis.navigator?.mediaDevices) {
  return Boolean(mediaDevices?.getUserMedia && mediaDevices?.enumerateDevices)
}

export function stopCameraStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return
  for (const track of stream.getTracks()) {
    if (typeof track?.stop === 'function') {
      track.stop()
    }
  }
}

export function getAvatarCameraErrorKey(error) {
  const name = error?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'profile.errors.cameraPermissionDenied'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'profile.errors.cameraNotFound'
  }
  return 'profile.errors.cameraUnavailable'
}

export async function listAvatarVideoDevices(mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices?.enumerateDevices) return []

  const devices = await mediaDevices.enumerateDevices()
  let index = 0
  return devices
    .filter((device) => device.kind === 'videoinput')
    .map((device) => {
      index += 1
      return {
        label: device.label || `Camera ${index}`,
        value: device.deviceId
      }
    })
}

export async function startAvatarCameraStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  deviceId = null
} = {}) {
  if (!isAvatarCameraSupported(mediaDevices)) {
    const error = new Error('Camera API unavailable')
    error.name = 'NotSupportedError'
    throw error
  }

  const video = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: 'user' }

  return mediaDevices.getUserMedia({
    audio: false,
    video
  })
}

export async function captureAvatarCameraFrame(videoElement, {
  outputMimeType = AVATAR_CAMERA_MIME_TYPE,
  quality = 0.92,
  now = Date.now
} = {}) {
  const width = videoElement?.videoWidth || 0
  const height = videoElement?.videoHeight || 0
  if (!width || !height || typeof document === 'undefined') {
    throw new Error('Camera frame is not ready')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context || typeof canvas.toBlob !== 'function') {
    throw new Error('Camera capture is unavailable')
  }

  context.drawImage(videoElement, 0, 0, width, height)

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, outputMimeType, quality)
  })

  if (!blob) {
    throw new Error('Camera capture failed')
  }

  return new File([blob], `avatar-camera-${now()}.webp`, { type: outputMimeType })
}
