import { describe, expect, it } from 'vitest'
import {
  isOptimizableImageFile,
  normalizeUploadSettings
} from '../../src/lib/upload-settings.js'

describe('upload settings helpers', () => {
  it('normalizes defaults and calculates byte limits', () => {
    expect(normalizeUploadSettings()).toEqual({
      maxFileSizeMb: 20,
      maxFileSizeBytes: 20 * 1024 * 1024,
      imageMaxDimensionPx: 1920,
      imageQuality: 82,
      imageQualityRatio: 0.82
    })
  })

  it('normalizes platform settings and clamps invalid values', () => {
    expect(normalizeUploadSettings({
      upload_max_file_size_mb: '64',
      image_upload_max_dimension_px: '9000',
      image_upload_quality: '0'
    })).toMatchObject({
      maxFileSizeMb: 64,
      imageMaxDimensionPx: 8192,
      imageQuality: 1
    })
  })

  it('only optimizes jpeg png and webp files', () => {
    expect(isOptimizableImageFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isOptimizableImageFile(new File(['x'], 'photo.gif', { type: 'image/gif' }))).toBe(false)
    expect(isOptimizableImageFile(new File(['x'], 'photo.svg', { type: 'image/svg+xml' }))).toBe(false)
  })
})
