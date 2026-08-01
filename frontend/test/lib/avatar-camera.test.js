import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureAvatarCameraFrame,
  getAvatarCameraErrorKey,
  isAvatarCameraSupported,
  listAvatarVideoDevices,
  startAvatarCameraStream,
  stopCameraStream
} from '../../src/lib/avatar-camera.js'

describe('avatar camera helpers', () => {
  const originalDocument = globalThis.document

  afterEach(() => {
    globalThis.document = originalDocument
  })

  it('recognizes camera API support only when capture and device listing are available', () => {
    expect(isAvatarCameraSupported({
      getUserMedia: vi.fn(),
      enumerateDevices: vi.fn()
    })).toBe(true)
    expect(isAvatarCameraSupported({ getUserMedia: vi.fn() })).toBe(false)
  })

  it('starts a selected camera stream without requesting audio', async () => {
    const stream = { id: 'stream-1' }
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn()
    }

    await expect(startAvatarCameraStream({ mediaDevices, deviceId: 'camera-2' })).resolves.toBe(stream)

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        deviceId: { exact: 'camera-2' }
      }
    })
  })

  it('lists video devices with stable fallback labels', async () => {
    const mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Mic' },
        { kind: 'videoinput', deviceId: 'camera-1', label: 'Front Camera' },
        { kind: 'videoinput', deviceId: 'camera-2', label: '' }
      ])
    }

    await expect(listAvatarVideoDevices(mediaDevices)).resolves.toEqual([
      { label: 'Front Camera', value: 'camera-1' },
      { label: 'Camera 2', value: 'camera-2' }
    ])
  })

  it('stops all active camera tracks', () => {
    const firstTrack = { stop: vi.fn() }
    const secondTrack = { stop: vi.fn() }

    stopCameraStream({
      getTracks: () => [firstTrack, secondTrack]
    })

    expect(firstTrack.stop).toHaveBeenCalledOnce()
    expect(secondTrack.stop).toHaveBeenCalledOnce()
  })

  it('maps camera permission and missing-device failures to profile errors', () => {
    expect(getAvatarCameraErrorKey({ name: 'NotAllowedError' })).toBe('profile.errors.cameraPermissionDenied')
    expect(getAvatarCameraErrorKey({ name: 'NotFoundError' })).toBe('profile.errors.cameraNotFound')
    expect(getAvatarCameraErrorKey({ name: 'NotSupportedError' })).toBe('profile.errors.cameraUnavailable')
  })

  it('captures the current video frame as a webp file', async () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((resolve, mimeType) => resolve(new Blob(['avatar'], { type: mimeType })))
    }
    globalThis.document = {
      createElement: vi.fn(() => canvas)
    }

    const file = await captureAvatarCameraFrame(
      { videoWidth: 320, videoHeight: 240 },
      { now: () => 1234 }
    )

    expect(canvas.width).toBe(320)
    expect(canvas.height).toBe(240)
    expect(drawImage).toHaveBeenCalledWith({ videoWidth: 320, videoHeight: 240 }, 0, 0, 320, 240)
    expect(file.name).toBe('avatar-camera-1234.webp')
    expect(file.type).toBe('image/webp')
  })
})
