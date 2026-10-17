import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, Room: class {
    remoteParticipants = new Map()
    localParticipant = { getTrackPublication: () => null, setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined) }
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = vi.fn().mockResolvedValue(undefined)
    on() {}
  } }
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('LiveKit runtime endpoint selection', () => {
  for (const publicUrl of ['wss://calls.example.com', 'https://other-calls.example.com/livekit']) {
    it(`connects to ${publicUrl} when the backend returns an internal endpoint`, async () => {
      vi.stubGlobal('window', { __NEBULYNK_CONFIG__: { livekitUrl: publicUrl } })
      vi.stubEnv('VITE_LIVEKIT_URL', 'wss://obsolete.example.com')
      vi.stubEnv('VITE_FAKE_LIVEKIT', 'false')
      const { connectToRoom, getRoom } = await import('../../src/lib/livekit.js')
      await connectToRoom('meeting-token', 'ws://livekit:7880')
      expect(getRoom().connect).toHaveBeenCalledWith(publicUrl.replace(/^https:/, 'wss:'), 'meeting-token')
    })
  }

  it('keeps a public server-resolved endpoint ahead of the configured fallback', async () => {
    vi.stubGlobal('window', { __NEBULYNK_CONFIG__: { livekitUrl: 'wss://fallback.example.com' } })
    vi.stubEnv('VITE_FAKE_LIVEKIT', 'false')
    const { connectToRoom, getRoom } = await import('../../src/lib/livekit.js')
    await connectToRoom('token', 'https://resolved.example.com/meetings')
    expect(getRoom().connect).toHaveBeenCalledWith('wss://resolved.example.com/meetings', 'token')
  })
})
