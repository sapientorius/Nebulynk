import { describe, expect, it, vi } from 'vitest'
import {
  MICROPHONE_PERMISSION_DENIED,
  MICROPHONE_PERMISSION_GRANTED,
  MICROPHONE_PERMISSION_PROMPTED,
  MICROPHONE_PERMISSION_UNSUPPORTED,
  requestMicrophonePermission
} from '../../src/lib/microphone-permission.js'

describe('microphone permission helper', () => {
  it('does not request media when permission is already granted', async () => {
    const mediaDevices = {
      getUserMedia: vi.fn()
    }
    const navigatorRef = {
      mediaDevices,
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' })
      }
    }

    await expect(requestMicrophonePermission({ navigatorRef })).resolves.toEqual({
      granted: true,
      status: MICROPHONE_PERMISSION_GRANTED
    })

    expect(navigatorRef.permissions.query).toHaveBeenCalledWith({ name: 'microphone' })
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('requests microphone access and stops the temporary stream when permission is prompt', async () => {
    const track = { stop: vi.fn() }
    const stream = { getTracks: vi.fn(() => [track]) }
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream)
    }
    const navigatorRef = {
      mediaDevices,
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' })
      }
    }

    await expect(requestMicrophonePermission({ navigatorRef })).resolves.toEqual({
      granted: true,
      status: MICROPHONE_PERMISSION_PROMPTED
    })

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stream.getTracks).toHaveBeenCalledOnce()
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('falls back to getUserMedia when permission state cannot be queried', async () => {
    const track = { stop: vi.fn() }
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] })
    }
    const navigatorRef = {
      mediaDevices,
      permissions: {
        query: vi.fn().mockRejectedValue(new Error('not supported'))
      }
    }

    await expect(requestMicrophonePermission({ navigatorRef })).resolves.toEqual({
      granted: true,
      status: MICROPHONE_PERMISSION_PROMPTED
    })

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(track.stop).toHaveBeenCalledOnce()
  })

  it('returns denied without throwing when permission is denied', async () => {
    const mediaDevices = {
      getUserMedia: vi.fn()
    }
    const navigatorRef = {
      mediaDevices,
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' })
      }
    }

    await expect(requestMicrophonePermission({ navigatorRef })).resolves.toEqual({
      granted: false,
      status: MICROPHONE_PERMISSION_DENIED
    })

    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })

  it('returns unsupported when getUserMedia is unavailable', async () => {
    await expect(requestMicrophonePermission({ navigatorRef: {} })).resolves.toEqual({
      granted: false,
      status: MICROPHONE_PERMISSION_UNSUPPORTED
    })
  })
})
