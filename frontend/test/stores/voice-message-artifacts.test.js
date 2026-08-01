import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoiceMessageArtifactsStore } from '../../src/stores/voice-message-artifacts.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getCurrentUser: vi.fn(() => null)
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
}

describe('voice message artifacts store', () => {
  beforeEach(() => {
    resetApiMock()
    useVoiceMessageArtifactsStore().reset()
  })

  it('requests private artifacts and stores them by file id', async () => {
    const store = useVoiceMessageArtifactsStore()
    apiMock.post.mockResolvedValue({
      data: {
        id: 'artifact-1',
        message_id: 'message-1',
        file_id: 'file-1',
        status: 'ready',
        transcript: 'Hello'
      }
    })

    const result = await store.requestArtifact({
      messageId: 'message-1',
      fileId: 'file-1'
    })

    expect(apiMock.post).toHaveBeenCalledWith('/voice-message-artifacts', {
      message_id: 'message-1',
      file_id: 'file-1',
      retry: false
    })
    expect(result.status).toBe('ready')
    expect(store.getArtifact('file-1').transcript).toBe('Hello')
    expect(store.isLoading('file-1')).toBe(false)
  })

  it('ingests hydrated message artifacts and realtime updates', () => {
    const store = useVoiceMessageArtifactsStore()

    store.ingestMessage({
      files: [{
        id: 'file-1',
        voice_artifact: {
          id: 'artifact-1',
          file_id: 'file-1',
          status: 'processing'
        }
      }]
    })
    store.applyRealtimeArtifact({
      id: 'artifact-1',
      file_id: 'file-1',
      status: 'ready',
      transcript: 'Ready'
    })

    expect(store.getArtifact('file-1').status).toBe('ready')
    expect(store.getArtifact('file-1').transcript).toBe('Ready')
  })
})
