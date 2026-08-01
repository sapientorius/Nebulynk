import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { optimizeImageForUpload } from '../../src/lib/image-upload-optimizer.js'

const originalDocument = globalThis.document
const originalImage = globalThis.Image
const originalUrl = globalThis.URL

function installImageEnvironment({
  width = 4000,
  height = 2000,
  outputBytes = 1000
} = {}) {
  const drawImage = vi.fn()
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toBlob: vi.fn((resolve, mimeType, quality) => {
      resolve(new Blob([Buffer.alloc(outputBytes, 1)], { type: mimeType }))
      canvas.mimeType = mimeType
      canvas.quality = quality
    })
  }

  globalThis.document = {
    createElement: vi.fn(() => canvas)
  }

  globalThis.URL = {
    createObjectURL: vi.fn(() => 'blob:image'),
    revokeObjectURL: vi.fn()
  }

  globalThis.Image = class MockImage {
    constructor() {
      this.naturalWidth = width
      this.naturalHeight = height
      this.onload = null
      this.onerror = null
    }

    set src(value) {
      this._src = value
      queueMicrotask(() => this.onload?.())
    }
  }

  return { canvas, drawImage }
}

describe('image upload optimizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.document = originalDocument
    globalThis.Image = originalImage
    globalThis.URL = originalUrl
  })

  it('downscales and encodes optimizable images as webp', async () => {
    const { canvas, drawImage } = installImageEnvironment()
    const file = new File([Buffer.alloc(5000, 1)], 'photo.jpg', { type: 'image/jpeg' })

    const result = await optimizeImageForUpload(file, {
      imageMaxDimensionPx: 1920,
      imageQuality: 82
    })

    expect(result.optimized).toBe(true)
    expect(result.file.name).toBe('photo.webp')
    expect(result.file.type).toBe('image/webp')
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(960)
    expect(canvas.quality).toBe(0.82)
    expect(drawImage).toHaveBeenCalled()
  })

  it('does not upscale images below the configured max dimension', async () => {
    const { canvas } = installImageEnvironment({ width: 800, height: 600, outputBytes: 1000 })
    const file = new File([Buffer.alloc(5000, 1)], 'small.png', { type: 'image/png' })

    const result = await optimizeImageForUpload(file, {
      imageMaxDimensionPx: 1920,
      imageQuality: 82
    })

    expect(result.optimized).toBe(true)
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
  })

  it('keeps the original when optimized output is larger', async () => {
    installImageEnvironment({ outputBytes: 6000 })
    const file = new File([Buffer.alloc(5000, 1)], 'photo.webp', { type: 'image/webp' })

    const result = await optimizeImageForUpload(file, {
      imageMaxDimensionPx: 1920,
      imageQuality: 82
    })

    expect(result.optimized).toBe(false)
    expect(result.reason).toBe('larger_than_original')
    expect(result.file).toBe(file)
  })

  it('skips unsupported image types', async () => {
    const file = new File([Buffer.alloc(5000, 1)], 'animation.gif', { type: 'image/gif' })

    const result = await optimizeImageForUpload(file)

    expect(result.optimized).toBe(false)
    expect(result.reason).toBe('unsupported')
    expect(result.file).toBe(file)
  })
})
