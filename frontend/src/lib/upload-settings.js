export const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 20
export const DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX = 1920
export const DEFAULT_IMAGE_UPLOAD_QUALITY = 82

export const OPTIMIZABLE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function parseInteger(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function clampInteger(value, fallback, min, max) {
  const parsed = parseInteger(value)
  if (parsed === null) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function normalizeUploadSettings(settings = {}) {
  const maxFileSizeMb = clampInteger(
    settings.upload_max_file_size_mb ?? settings.uploadMaxFileSizeMb,
    DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
    1,
    1024
  )
  const imageMaxDimensionPx = clampInteger(
    settings.image_upload_max_dimension_px ?? settings.imageUploadMaxDimensionPx,
    DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
    256,
    8192
  )
  const imageQuality = clampInteger(
    settings.image_upload_quality ?? settings.imageUploadQuality,
    DEFAULT_IMAGE_UPLOAD_QUALITY,
    1,
    100
  )

  return {
    maxFileSizeMb,
    maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
    imageMaxDimensionPx,
    imageQuality,
    imageQualityRatio: imageQuality / 100
  }
}

export function isOptimizableImageFile(file) {
  return OPTIMIZABLE_IMAGE_TYPES.includes(file?.type)
}

export function formatUploadLimitMb(settings) {
  return String(normalizeUploadSettings(settings).maxFileSizeMb)
}
