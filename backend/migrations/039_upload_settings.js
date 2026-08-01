const MB = 1024 * 1024
const DEFAULT_UPLOAD_MAX_FILE_SIZE_MB = 20
const DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX = 1920
const DEFAULT_IMAGE_UPLOAD_QUALITY = 82

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

function getDefaults(env = process.env) {
  const legacyMaxBytes = parseInteger(env.MAX_FILE_SIZE)
  const legacyMaxMb = legacyMaxBytes && legacyMaxBytes > 0
    ? Math.ceil(legacyMaxBytes / MB)
    : null

  return {
    upload_max_file_size_mb: String(clampInteger(
      env.UPLOAD_MAX_FILE_SIZE_MB,
      legacyMaxMb || DEFAULT_UPLOAD_MAX_FILE_SIZE_MB,
      1,
      1024
    )),
    image_upload_max_dimension_px: String(clampInteger(
      env.UPLOAD_IMAGE_MAX_DIMENSION_PX,
      DEFAULT_IMAGE_UPLOAD_MAX_DIMENSION_PX,
      256,
      8192
    )),
    image_upload_quality: String(clampInteger(
      env.UPLOAD_IMAGE_COMPRESSION_QUALITY,
      DEFAULT_IMAGE_UPLOAD_QUALITY,
      1,
      100
    ))
  }
}

async function insertMissingSetting(knex, key, value) {
  const existing = await knex('platform_settings').where('key', key).first()
  if (existing) return
  await knex('platform_settings').insert({ key, value })
}

export async function up(knex) {
  const defaults = getDefaults()
  for (const [key, value] of Object.entries(defaults)) {
    await insertMissingSetting(knex, key, value)
  }
}

export async function down(knex) {
  await knex('platform_settings')
    .whereIn('key', [
      'upload_max_file_size_mb',
      'image_upload_max_dimension_px',
      'image_upload_quality'
    ])
    .delete()
}
