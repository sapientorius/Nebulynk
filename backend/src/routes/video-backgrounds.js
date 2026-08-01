import formidable from 'formidable'
import { readFile, unlink } from 'fs/promises'
import { readStoredFile } from '../lib/storage.js'
import {
  MAX_VIDEO_BACKGROUND_UPLOAD_SIZE,
  VIDEO_BACKGROUND_INPUT_MIME_TYPES
} from '../lib/video-backgrounds.js'
import { buildErrorBody } from '../lib/errors.js'
import { authenticateRequest } from './authenticate-request.js'

function getContentRouteMatch(pathname) {
  return pathname.match(/^\/video-backgrounds\/([^/]+)\/content$/)
}

function getFieldValue(fields, key) {
  const value = fields?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

async function cleanupTempFile(tempPath) {
  if (!tempPath) return
  try {
    await unlink(tempPath)
  } catch {
    // Ignore temp cleanup errors.
  }
}

export function configureVideoBackgroundRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const contentRouteMatch = getContentRouteMatch(ctx.path)
    const isUploadRoute = ctx.path === '/video-backgrounds/upload'

    if (!contentRouteMatch && !isUploadRoute) {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.video_backgrounds.authentication_required',
      invalidTokenCode: 'api.video_backgrounds.invalid_token'
    })
    if (!user) return

    if (ctx.method === 'GET' && contentRouteMatch) {
      const id = contentRouteMatch[1]
      const service = app.service('video-backgrounds')
      const row = await service.getStoredBackground(id, { authenticated: true, user })
      const storageClient = app.get('storageClient')
      if (!storageClient) {
        ctx.status = 503
        ctx.body = buildErrorBody(
          'api.video_backgrounds.storage_unavailable',
          'Background storage unavailable'
        )
        return
      }

      const stored = await readStoredFile(storageClient, {
        key: row.storage_key,
        bucket: row.bucket
      })
      ctx.type = stored.mime || row.mime_type || 'image/webp'
      ctx.body = stored.buffer
      return
    }

    if (ctx.method !== 'POST' || !isUploadRoute) {
      ctx.status = 405
      ctx.body = buildErrorBody('api.video_backgrounds.method_not_allowed', 'Method not allowed')
      return
    }

    const form = formidable({
      maxFileSize: MAX_VIDEO_BACKGROUND_UPLOAD_SIZE,
      keepExtensions: true
    })
    let uploadedFile

    try {
      const [fields, files] = await form.parse(ctx.req)
      uploadedFile = files.file?.[0]
      if (!uploadedFile) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.video_backgrounds.no_file_provided', 'No file provided')
        return
      }

      if (!VIDEO_BACKGROUND_INPUT_MIME_TYPES.includes(uploadedFile.mimetype)) {
        ctx.status = 400
        ctx.body = buildErrorBody(
          'api.video_backgrounds.unsupported_image_type',
          'Unsupported image type'
        )
        return
      }

      const buffer = await readFile(uploadedFile.filepath)
      const created = await app.service('video-backgrounds').storeUploadedBackground(user, {
        buffer,
        title: getFieldValue(fields, 'title')
      })
      ctx.status = 201
      ctx.body = created
    } catch (error) {
      if (error?.data?.error_code) {
        ctx.status = error.code || 400
        ctx.body = buildErrorBody(error.data.error_code, error.message, error.data.error_params)
      } else {
        ctx.status = 400
        ctx.body = buildErrorBody(
          'api.video_backgrounds.upload_failed',
          error.message || 'Background upload failed'
        )
      }
    } finally {
      await cleanupTempFile(uploadedFile?.filepath)
    }
  })
}
