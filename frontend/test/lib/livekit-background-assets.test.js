import { afterEach, describe, expect, it, vi } from 'vitest'

const backgroundBlurMock = vi.hoisted(() => vi.fn(() => ({ name: 'background-blur' })))

vi.mock('@livekit/track-processors', () => ({
  BackgroundBlur: backgroundBlurMock,
  supportsBackgroundProcessors: vi.fn(() => true),
  supportsModernBackgroundProcessors: vi.fn(() => true)
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  backgroundBlurMock.mockClear()
})

describe('LiveKit background blur assets', () => {
  it('configures BackgroundBlur to use same-origin MediaPipe assets', async () => {
    vi.stubEnv('VITE_FAKE_LIVEKIT', 'true')
    const livekit = await import('../../src/lib/livekit.js')

    await livekit.connectToRoom('token', 'ws://livekit.local')
    await livekit.startCamera({ backgroundBlurEnabled: true })

    expect(backgroundBlurMock).toHaveBeenCalledWith(
      12,
      undefined,
      undefined,
      {
        assetPaths: {
          tasksVisionFileSet: '/vendor/mediapipe/tasks-vision/0.10.14/wasm',
          modelAssetPath: '/vendor/mediapipe/models/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
        }
      }
    )
    expect(JSON.stringify(backgroundBlurMock.mock.calls)).not.toContain('cdn.jsdelivr.net')
    expect(JSON.stringify(backgroundBlurMock.mock.calls)).not.toContain('storage.googleapis.com')
  })
})
