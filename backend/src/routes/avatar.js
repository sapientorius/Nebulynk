import { createId } from '@paralleldrive/cuid2'
import formidable from 'formidable'
import { readFile, unlink } from 'fs/promises'
import { uploadFile, readStoredFile, deleteFile } from '../lib/storage.js'
import { logger } from '../logger.js'
import { buildErrorBody } from '../lib/errors.js'
import { authenticateRequest } from './authenticate-request.js'
import {
  AVATAR_INPUT_MIME_TYPES,
  MAX_AVATAR_UPLOAD_SIZE,
  buildAvatarUrl,
  normalizeAvatarImage
} from '../lib/avatar.js'

function getAvatarRouteMatch(pathname) {
  return pathname.match(/^\/users\/([^/]+)\/avatar$/)
}

async function cleanupTempFile(tempPath) {
  if (!tempPath) return

  try {
    await unlink(tempPath)
  } catch {
    // Ignore temp cleanup errors.
  }
}

async function deleteStoredAvatar(app, storageKey) {
  if (!storageKey) return

  const storageClient = app.get('storageClient')
  const bucket = app.get('storageBucket')
  if (!storageClient || !bucket) return

  try {
    await deleteFile(storageClient, {
      key: storageKey,
      bucket
    })
  } catch (error) {
    logger.warn('Failed to delete avatar object:', { error: error.message })
  }
}

export function configureAvatarRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const avatarRouteMatch = getAvatarRouteMatch(ctx.path)
    const isUploadRoute = ctx.path === '/users/me/avatar'

    if (!avatarRouteMatch && !isUploadRoute) {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.avatar.authentication_required',
      invalidTokenCode: 'api.avatar.invalid_token'
    })
    if (!user) return

    if (ctx.method === 'GET' && avatarRouteMatch) {
      const targetUserId = avatarRouteMatch[1]
      const db = app.get('postgresqlClient')
      const storageClient = app.get('storageClient')
      const bucket = app.get('storageBucket')

      if (!storageClient || !bucket) {
        ctx.status = 503
        ctx.body = buildErrorBody('api.avatar.storage_unavailable', 'Avatar storage unavailable')
        return
      }

      const targetUser = await db('users').where('id', targetUserId).first()
      if (!targetUser?.avatar_storage_key) {
        ctx.status = 404
        ctx.body = buildErrorBody('api.avatar.not_found', 'Avatar not found')
        return
      }

      try {
        const file = await readStoredFile(storageClient, {
          key: targetUser.avatar_storage_key,
          bucket
        })
        ctx.status = 200
        ctx.type = file.mime
        ctx.set('Cache-Control', 'private, max-age=31536000, immutable')
        ctx.body = file.buffer
      } catch (error) {
        logger.warn('Avatar read failed:', { error: error.message, userId: targetUser.id })
        ctx.status = 404
        ctx.body = buildErrorBody('api.avatar.not_found', 'Avatar not found')
      }
      return
    }

    if (ctx.method === 'DELETE' && isUploadRoute) {
      const db = app.get('postgresqlClient')
      const currentUser = await db('users').where('id', user.id).first()

      const updated = await app.service('users').patch(user.id, {
        avatar_url: null,
        avatar_storage_key: null
      }, {
        authenticated: true,
        user
      })

      await deleteStoredAvatar(app, currentUser?.avatar_storage_key || null)

      ctx.status = 200
      ctx.body = updated
      return
    }

    if (ctx.method !== 'POST' || !isUploadRoute) {
      return next()
    }

    const storageClient = app.get('storageClient')
    const bucket = app.get('storageBucket')
    const db = app.get('postgresqlClient')

    if (!storageClient || !bucket) {
      ctx.status = 503
      ctx.body = buildErrorBody('api.avatar.storage_unavailable', 'Avatar storage unavailable')
      return
    }

    const form = formidable({
      maxFileSize: MAX_AVATAR_UPLOAD_SIZE,
      keepExtensions: true
    })

    let uploadedFile
    let newStorageKey = null

    try {
      let files
      try {
        ;[, files] = await form.parse(ctx.req)
      } catch (error) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.avatar.multipart_parse_failed', `Upload failed: ${error.message}`)
        return
      }

      uploadedFile = files.file?.[0]

      if (!uploadedFile) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.avatar.no_file_provided', 'No file provided')
        return
      }

      if (!AVATAR_INPUT_MIME_TYPES.includes(uploadedFile.mimetype)) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.avatar.unsupported_image_type', 'Unsupported image type')
        return
      }

      const inputBuffer = await readFile(uploadedFile.filepath)
      const normalized = await normalizeAvatarImage(inputBuffer)
      const existingUser = await db('users').where('id', user.id).first()
      const avatarId = createId()
      newStorageKey = `avatars/${user.id}/${avatarId}.webp`

      await uploadFile(storageClient, {
        buffer: normalized.buffer,
        key: newStorageKey,
        mime: normalized.mimeType,
        bucket
      })

      const updatedAt = new Date().toISOString()
      const updated = await app.service('users').patch(user.id, {
        avatar_url: buildAvatarUrl(user.id, updatedAt),
        avatar_storage_key: newStorageKey
      }, {
        authenticated: true,
        user
      })

      if (existingUser?.avatar_storage_key && existingUser.avatar_storage_key !== newStorageKey) {
        await deleteStoredAvatar(app, existingUser.avatar_storage_key)
      }

      ctx.status = 200
      ctx.body = updated
    } catch (error) {
      if (error?.data?.error_code) {
        ctx.status = Number(error.code) || 400
        ctx.body = buildErrorBody(
          error.data.error_code,
          error.message || 'Avatar upload failed',
          error.data.error_params || {}
        )
      } else {
        logger.error('Avatar upload failed:', { error: error.message })
        ctx.status = 500
        ctx.body = buildErrorBody('api.avatar.upload_failed', 'Avatar upload failed')
      }

      if (newStorageKey) {
        await deleteStoredAvatar(app, newStorageKey)
      }
    } finally {
      await cleanupTempFile(uploadedFile?.filepath)
    }
  })
}
