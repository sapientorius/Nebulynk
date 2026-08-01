export const MICROPHONE_PERMISSION_GRANTED = 'granted'
export const MICROPHONE_PERMISSION_PROMPTED = 'prompted'
export const MICROPHONE_PERMISSION_DENIED = 'denied'
export const MICROPHONE_PERMISSION_UNSUPPORTED = 'unsupported'
export const MICROPHONE_PERMISSION_UNAVAILABLE = 'unavailable'

function stopMediaStream(stream) {
  const tracks = typeof stream?.getTracks === 'function' ? stream.getTracks() : []
  for (const track of tracks) {
    track?.stop?.()
  }
}

function isPermissionDeniedError(error) {
  return error?.name === 'NotAllowedError'
    || error?.name === 'PermissionDeniedError'
    || error?.name === 'SecurityError'
}

async function getMicrophonePermissionState(navigatorRef) {
  if (typeof navigatorRef?.permissions?.query !== 'function') return null

  try {
    const status = await navigatorRef.permissions.query({ name: 'microphone' })
    return typeof status?.state === 'string' ? status.state : null
  } catch {
    return null
  }
}

export async function requestMicrophonePermission(options = {}) {
  const navigatorRef = options.navigatorRef || globalThis.navigator
  const mediaDevices = navigatorRef?.mediaDevices || null

  if (typeof mediaDevices?.getUserMedia !== 'function') {
    return {
      granted: false,
      status: MICROPHONE_PERMISSION_UNSUPPORTED
    }
  }

  const permissionState = await getMicrophonePermissionState(navigatorRef)
  if (permissionState === MICROPHONE_PERMISSION_GRANTED) {
    return {
      granted: true,
      status: MICROPHONE_PERMISSION_GRANTED
    }
  }
  if (permissionState === MICROPHONE_PERMISSION_DENIED) {
    return {
      granted: false,
      status: MICROPHONE_PERMISSION_DENIED
    }
  }

  try {
    const stream = await mediaDevices.getUserMedia({ audio: true })
    stopMediaStream(stream)
    return {
      granted: true,
      status: MICROPHONE_PERMISSION_PROMPTED
    }
  } catch (error) {
    return {
      granted: false,
      status: isPermissionDeniedError(error)
        ? MICROPHONE_PERMISSION_DENIED
        : MICROPHONE_PERMISSION_UNAVAILABLE,
      error
    }
  }
}
