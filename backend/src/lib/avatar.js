import sharp from 'sharp'
import { badRequest } from './errors.js'

export const AVATAR_SIZE = 512
export const MAX_AVATAR_UPLOAD_SIZE = 10 * 1024 * 1024
export const MAX_AVATAR_FILE_SIZE = 200 * 1024
export const AVATAR_INPUT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_OUTPUT_MIME_TYPE = 'image/webp'
export const AVATAR_QUALITY_STEPS = [84, 78, 72, 66, 60, 54]

export function buildAvatarUrl(userId, versionToken = new Date().toISOString()) {
  return `/api/users/${userId}/avatar?v=${encodeURIComponent(versionToken)}`
}

export function isManagedAvatarUrl(value) {
  return typeof value === 'string' && /^\/api\/users\/[^/]+\/avatar(?:\?|$)/.test(value)
}

export function assertAvatarPatchAllowed(context) {
  if (!context?.params?.provider) return context

  if (
    Object.prototype.hasOwnProperty.call(context.data || {}, 'avatar_url')
    || Object.prototype.hasOwnProperty.call(context.data || {}, 'avatar_storage_key')
  ) {
    throw badRequest(
      'api.users.avatar_updates_use_avatar_endpoint',
      {},
      'Avatar updates must use the avatar endpoint'
    )
  }

  return context
}

export async function normalizeAvatarImage(buffer) {
  let metadata

  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    throw badRequest('api.avatar.invalid_image', {}, 'Invalid image file')
  }

  if (!AVATAR_INPUT_MIME_TYPES.includes(`image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}`)) {
    throw badRequest('api.avatar.unsupported_image_type', {}, 'Unsupported image type')
  }

  for (const quality of AVATAR_QUALITY_STEPS) {
    const normalized = await sharp(buffer)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, {
        fit: 'cover',
        position: 'centre'
      })
      .webp({
        quality,
        effort: 4
      })
      .toBuffer()

    if (normalized.byteLength <= MAX_AVATAR_FILE_SIZE) {
      return {
        buffer: normalized,
        mimeType: AVATAR_OUTPUT_MIME_TYPE,
        size: normalized.byteLength
      }
    }
  }

  throw badRequest(
    'api.avatar.could_not_optimize_image',
    { max_size_bytes: MAX_AVATAR_FILE_SIZE },
    'Could not optimize avatar image'
  )
}
