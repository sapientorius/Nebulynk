import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadsStore } from '../../src/stores/uploads.js'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}))

const getPlatformStatusMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/api.js', () => ({
  default: apiMock,
  getPlatformStatus: getPlatformStatusMock,
  getCurrentUser: vi.fn(() => null)
}))

function resetApiMock() {
  apiMock.get.mockReset()
  apiMock.post.mockReset()
  apiMock.patch.mockReset()
  apiMock.delete.mockReset()
}

describe('uploads store', () => {
  beforeEach(() => {
    resetApiMock()
    getPlatformStatusMock.mockReset()
  })

  it('uploads as multipart form data and forwards rounded progress', async () => {
    const store = useUploadsStore()
    const progressSpy = vi.fn()
    const file = new Blob(['hello'], { type: 'text/plain' })

    apiMock.post.mockImplementation((url, formData, config) => {
      expect(url).toBe('/upload')
      expect(formData).toBeInstanceOf(FormData)
      expect(formData.get('file')).not.toBeNull()
      expect(config.headers).toEqual({
        'Content-Type': 'multipart/form-data'
      })
      config.onUploadProgress({ loaded: 1, total: 3 })
      return Promise.resolve({ data: { id: 'file-1' } })
    })

    const result = await store.upload(file, progressSpy)

    expect(progressSpy).toHaveBeenCalledWith(33)
    expect(result).toEqual({ id: 'file-1' })
  })

  it('loads and normalizes upload settings from platform settings', async () => {
    const store = useUploadsStore()
    getPlatformStatusMock.mockResolvedValue({
      upload_max_file_size_mb: '64',
      image_upload_max_dimension_px: '2560',
      image_upload_quality: '76'
    })

    const settings = await store.loadUploadSettings()

    expect(getPlatformStatusMock).toHaveBeenCalledWith({ refresh: false })
    expect(settings).toMatchObject({
      maxFileSizeMb: 64,
      maxFileSizeBytes: 64 * 1024 * 1024,
      imageMaxDimensionPx: 2560,
      imageQuality: 76,
      imageQualityRatio: 0.76
    })
  })

  it('uploads voice messages with purpose and duration metadata', async () => {
    const store = useUploadsStore()
    const file = new Blob(['audio'], { type: 'audio/webm' })

    apiMock.post.mockImplementation((url, formData) => {
      expect(url).toBe('/upload')
      expect(formData.get('purpose')).toBe('voice_message')
      expect(formData.get('duration_ms')).toBe('2500')
      return Promise.resolve({ data: { id: 'file-voice', purpose: 'voice_message' } })
    })

    const result = await store.upload(file, null, {
      purpose: 'voice_message',
      durationMs: 2500
    })

    expect(result).toEqual({ id: 'file-voice', purpose: 'voice_message' })
  })

  it('transcribes temporary voice drafts without using the file upload endpoint', async () => {
    const store = useUploadsStore()
    const file = new Blob(['audio'], { type: 'audio/webm' })

    apiMock.post.mockImplementation((url, formData) => {
      expect(url).toBe('/voice-drafts/transcribe')
      expect(formData.get('channel_id')).toBe('channel-1')
      expect(formData.get('duration_ms')).toBe('3000')
      return Promise.resolve({
        data: {
          text: 'Hello draft.',
          raw_text: 'hello draft',
          polished: true,
          language: 'en',
          duration_ms: 3000
        }
      })
    })

    const result = await store.transcribeVoiceDraft(file, {
      channelId: 'channel-1',
      durationMs: 3000
    })

    expect(result).toEqual({
      text: 'Hello draft.',
      raw_text: 'hello draft',
      polished: true,
      language: 'en',
      duration_ms: 3000
    })
  })
})
