import { createId } from '@paralleldrive/cuid2'
import { uploadFile, getFileUrl } from '../lib/storage.js'
import { logger } from '../logger.js'
import formidable from 'formidable'
import { readFile, unlink } from 'fs/promises'
import { resolveUserPermissions } from '../hooks/check-permission.js'
import { buildErrorBody } from '../lib/errors.js'
import { resolveUploadMaxFileSizeBytes } from '../lib/upload-settings.js'
import { authenticateRequest } from './authenticate-request.js'

function getFieldValue(fields, key) {
  const value = fields?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeFilePurpose(value) {
  const normalized = typeof value === 'string' && value.trim()
    ? value.trim()
    : 'attachment'
  return normalized === 'voice_message' ? 'voice_message' : 'attachment'
}

function normalizeDurationMs(value) {
  if (value === undefined || value === null || value === '') return null
  const duration = Number(value)
  if (!Number.isFinite(duration) || duration < 0) return null
  return Math.round(duration)
}

export function configureUploadRoute(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== '/upload') {
      return next()
    }

    // Authenticate manually
    const authHeader = ctx.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401
      ctx.body = buildErrorBody('api.upload.authentication_required', 'Authentication required')
      return
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.upload.authentication_required',
      invalidTokenCode: 'api.upload.invalid_token'
    })
    if (!user) return

    // Enforce upload_files permission for external uploads.
    if (!user.is_admin) {
      const permissionResult = await resolveUserPermissions(app, user.id)
      if (!permissionResult.permissions.includes('upload_files')) {
        ctx.status = 403
        ctx.body = buildErrorBody('api.upload.missing_permission_upload_files', 'Missing permission: upload_files')
        return
      }
    }

    const storageClient = app.get('storageClient')
    const storagePresignClient = app.get('storagePresignClient') || storageClient
    const bucket = app.get('storageBucket')
    if (!storageClient || !storagePresignClient || !bucket) {
      ctx.status = 503
      ctx.body = buildErrorBody('api.upload.storage_unavailable', 'File storage unavailable')
      return
    }

    // Parse multipart form data
    const maxFileSize = await resolveUploadMaxFileSizeBytes(app)
    const form = formidable({
      maxFileSize,
      keepExtensions: true
    })

    let fields, files
    try {
      ;[fields, files] = await form.parse(ctx.req)
    } catch (error) {
      ctx.status = 400
      ctx.body = buildErrorBody('api.upload.multipart_parse_failed', `Upload failed: ${error.message}`)
      return
    }

    const uploadedFile = files.file?.[0]
    if (!uploadedFile) {
      ctx.status = 400
      ctx.body = buildErrorBody('api.upload.no_file_provided', 'No file provided')
      return
    }

    const purpose = normalizeFilePurpose(getFieldValue(fields, 'purpose'))
    const durationMs = normalizeDurationMs(getFieldValue(fields, 'duration_ms'))

    if (purpose === 'voice_message' && !uploadedFile.mimetype?.startsWith('audio/')) {
      ctx.status = 400
      ctx.body = buildErrorBody('api.upload.voice_message_audio_required', 'Voice messages must be audio files')
      return
    }

    const db = app.get('postgresqlClient')

    try {
      const buffer = await readFile(uploadedFile.filepath)
      const fileId = createId()
      const storageKey = `${user.id}/${fileId}/${uploadedFile.originalFilename}`

      await uploadFile(storageClient, {
        buffer,
        key: storageKey,
        mime: uploadedFile.mimetype,
        bucket
      })

      // Create file record (no message association yet)
      await db('files').insert({
        id: fileId,
        message_id: null,
        user_id: user.id,
        original_name: uploadedFile.originalFilename,
        storage_key: storageKey,
        mime_type: uploadedFile.mimetype,
        size: uploadedFile.size,
        purpose,
        duration_ms: durationMs,
        bucket,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      const url = await getFileUrl(storagePresignClient, { key: storageKey, bucket })

      ctx.status = 200
      ctx.body = {
        id: fileId,
        original_name: uploadedFile.originalFilename,
        mime_type: uploadedFile.mimetype,
        size: uploadedFile.size,
        purpose,
        duration_ms: durationMs,
        url
      }
    } catch (error) {
      logger.error('File upload failed:', { error: error.message })
      ctx.status = 500
      ctx.body = buildErrorBody('api.upload.file_upload_failed', 'File upload failed')
    } finally {
      // Clean up temp file
      try {
        await unlink(uploadedFile.filepath)
      } catch {
        // ignore cleanup errors
      }
    }
  })
}
