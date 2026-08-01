import sharp from 'sharp'
import { badRequest } from './errors.js'

export const VIDEO_BACKGROUND_INPUT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const VIDEO_BACKGROUND_OUTPUT_MIME_TYPE = 'image/webp'
export const MAX_VIDEO_BACKGROUND_UPLOAD_SIZE = 12 * 1024 * 1024
export const VIDEO_BACKGROUND_MAX_WIDTH = 1920
export const VIDEO_BACKGROUND_MAX_HEIGHT = 1080
export const DEFAULT_VIDEO_BACKGROUND_MAX_PER_USER = 20

export function resolveVideoBackgroundMaxPerUser(env = process.env) {
  const parsed = Number.parseInt(env.VIDEO_BACKGROUND_MAX_PER_USER || '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_VIDEO_BACKGROUND_MAX_PER_USER
  return Math.min(parsed, 100)
}

export function buildVideoBackgroundContentUrl(id, versionToken = new Date().toISOString()) {
  return `/api/video-backgrounds/${encodeURIComponent(id)}/content?v=${encodeURIComponent(versionToken)}`
}

export async function normalizeVideoBackgroundImage(buffer) {
  let metadata

  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw badRequest('api.video_backgrounds.invalid_image', {}, 'Invalid background image')
  }

  const inputMime = `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}`
  if (!VIDEO_BACKGROUND_INPUT_MIME_TYPES.includes(inputMime)) {
    throw badRequest('api.video_backgrounds.unsupported_image_type', {}, 'Unsupported image type')
  }

  try {
    const image = sharp(buffer)
      .rotate()
      .resize({
        width: VIDEO_BACKGROUND_MAX_WIDTH,
        height: VIDEO_BACKGROUND_MAX_HEIGHT,
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 84 })

    const outputBuffer = await image.toBuffer()
    const outputMetadata = await sharp(outputBuffer).metadata()

    return {
      buffer: outputBuffer,
      mimeType: VIDEO_BACKGROUND_OUTPUT_MIME_TYPE,
      size: outputBuffer.length,
      width: outputMetadata.width || VIDEO_BACKGROUND_MAX_WIDTH,
      height: outputMetadata.height || VIDEO_BACKGROUND_MAX_HEIGHT
    }
  } catch {
    throw badRequest(
      'api.video_backgrounds.processing_failed',
      {},
      'Could not process background image'
    )
  }
}

export function sanitizeVideoBackground(row) {
  if (!row) return null

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title || null,
    source: row.source,
    is_global: row.is_global === true,
    prompt: row.prompt || null,
    mime_type: row.mime_type,
    size: row.size,
    width: row.width,
    height: row.height,
    content_url: buildVideoBackgroundContentUrl(row.id, row.updated_at || row.created_at),
    published_by: row.published_by || null,
    published_at: row.published_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

export function sanitizeVideoBackgrounds(rows = []) {
  return rows.map((row) => sanitizeVideoBackground(row)).filter(Boolean)
}
