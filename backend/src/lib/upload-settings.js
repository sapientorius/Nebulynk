const MB = 1024 * 1024

export const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 20
export const DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX = 1920
export const DEFAULT_IMAGE_UPLOAD_QUALITY = 82

export const UPLOAD_SETTING_KEYS = {
  maxFileSizeMb: 'upload_max_file_size_mb',
  imageMaxDimensionPx: 'image_upload_max_dimension_px',
  imageQuality: 'image_upload_quality'
}

export const UPLOAD_SETTING_LIMITS = {
  maxFileSizeMb: { min: 1, max: 1024 },
  imageMaxDimensionPx: { min: 256, max: 8192 },
  imageQuality: { min: 1, max: 100 }
}

function parseInteger(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function clampInteger(value, fallback, { min, max }) {
  const parsed = parseInteger(value)
  if (parsed === null) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function getDefaultUploadSettingsFromEnv(env = process.env) {
  const legacyMaxBytes = parseInteger(env.MAX_FILE_SIZE)
  const legacyMaxMb = legacyMaxBytes && legacyMaxBytes > 0
    ? Math.ceil(legacyMaxBytes / MB)
    : null

  return {
    [UPLOAD_SETTING_KEYS.maxFileSizeMb]: String(clampInteger(
      env.UPLOAD_MAX_FILE_SIZE_MB,
      legacyMaxMb || DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
      UPLOAD_SETTING_LIMITS.maxFileSizeMb
    )),
    [UPLOAD_SETTING_KEYS.imageMaxDimensionPx]: String(clampInteger(
      env.UPLOAD_IMAGE_MAX_DIMENSION_PX,
      DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
      UPLOAD_SETTING_LIMITS.imageMaxDimensionPx
    )),
    [UPLOAD_SETTING_KEYS.imageQuality]: String(clampInteger(
      env.UPLOAD_IMAGE_COMPRESSION_QUALITY,
      DEFAULT_IMAGE_UPLOAD_QUALITY,
      UPLOAD_SETTING_LIMITS.imageQuality
    ))
  }
}

export function normalizeUploadSettingsMap(settings = {}, env = process.env) {
  const defaults = getDefaultUploadSettingsFromEnv(env)

  return {
    [UPLOAD_SETTING_KEYS.maxFileSizeMb]: String(clampInteger(
      settings[UPLOAD_SETTING_KEYS.maxFileSizeMb],
      Number(defaults[UPLOAD_SETTING_KEYS.maxFileSizeMb]),
      UPLOAD_SETTING_LIMITS.maxFileSizeMb
    )),
    [UPLOAD_SETTING_KEYS.imageMaxDimensionPx]: String(clampInteger(
      settings[UPLOAD_SETTING_KEYS.imageMaxDimensionPx],
      Number(defaults[UPLOAD_SETTING_KEYS.imageMaxDimensionPx]),
      UPLOAD_SETTING_LIMITS.imageMaxDimensionPx
    )),
    [UPLOAD_SETTING_KEYS.imageQuality]: String(clampInteger(
      settings[UPLOAD_SETTING_KEYS.imageQuality],
      Number(defaults[UPLOAD_SETTING_KEYS.imageQuality]),
      UPLOAD_SETTING_LIMITS.imageQuality
    ))
  }
}

export function normalizeUploadSettingsPatch(data = {}) {
  const defaults = getDefaultUploadSettingsFromEnv()
  const patch = {}

  if (Object.prototype.hasOwnProperty.call(data, 'uploadMaxFileSizeMb')) {
    patch.uploadMaxFileSizeMb = clampInteger(
      data.uploadMaxFileSizeMb,
      Number(defaults[UPLOAD_SETTING_KEYS.maxFileSizeMb]),
      UPLOAD_SETTING_LIMITS.maxFileSizeMb
    )
  }

  if (Object.prototype.hasOwnProperty.call(data, 'imageUploadMaxDimensionPx')) {
    patch.imageUploadMaxDimensionPx = clampInteger(
      data.imageUploadMaxDimensionPx,
      Number(defaults[UPLOAD_SETTING_KEYS.imageMaxDimensionPx]),
      UPLOAD_SETTING_LIMITS.imageMaxDimensionPx
    )
  }

  if (Object.prototype.hasOwnProperty.call(data, 'imageUploadQuality')) {
    patch.imageUploadQuality = clampInteger(
      data.imageUploadQuality,
      Number(defaults[UPLOAD_SETTING_KEYS.imageQuality]),
      UPLOAD_SETTING_LIMITS.imageQuality
    )
  }

  return patch
}

export async function resolveUploadSettings(app) {
  const db = app.get('postgresqlClient')
  if (!db) {
    return normalizeUploadSettingsMap()
  }

  try {
    const keys = Object.values(UPLOAD_SETTING_KEYS)
    const rows = await db('platform_settings').whereIn('key', keys)
    const settings = {}
    for (const row of rows || []) {
      settings[row.key] = row.value
    }
    return normalizeUploadSettingsMap(settings)
  } catch {
    return normalizeUploadSettingsMap()
  }
}

export async function resolveUploadMaxFileSizeBytes(app) {
  const settings = await resolveUploadSettings(app)
  return Number(settings[UPLOAD_SETTING_KEYS.maxFileSizeMb]) * MB
}
