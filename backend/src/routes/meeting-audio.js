import yazl from 'yazl'
import { authenticateRequest } from './authenticate-request.js'
import { buildErrorBody } from '../lib/errors.js'
import { readStoredFile } from '../lib/storage.js'
import { isDownloadableMeetingRecording } from '../domains/meetings/artifact-state.js'

const { ZipFile } = yazl

function sanitizeFilenameSegment(value, fallback = 'recording') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function resolveRecordingLabel(recording) {
  if (typeof recording?.participant_display_name === 'string' && recording.participant_display_name.trim()) {
    return recording.participant_display_name.trim()
  }
  if (typeof recording?.participant_identity === 'string' && recording.participant_identity.trim()) {
    return recording.participant_identity.trim()
  }
  if (typeof recording?.user_id === 'string' && recording.user_id.trim()) {
    return recording.user_id.trim()
  }
  return 'recording'
}

function resolveRecordingExtension(recording) {
  const storageKey = typeof recording?.storage_key === 'string' ? recording.storage_key.trim() : ''
  const match = storageKey.match(/(\.[a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : '.mp4'
}

function buildRecordingEntryName(recording) {
  return `${sanitizeFilenameSegment(resolveRecordingLabel(recording))}-${recording.id}${resolveRecordingExtension(recording)}`
}

export function configureMeetingAudioRoute(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    const match = ctx.path.match(/^\/meetings\/([^/]+)\/audio$/)
    if (ctx.method !== 'GET' || !match) {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.meetings.authentication_required',
      invalidTokenCode: 'api.meetings.invalid_token'
    })
    if (!user) return

    if (user.is_admin !== true) {
      ctx.status = 403
      ctx.body = buildErrorBody(
        'api.meetings.audio_download_admin_only',
        'Only admins can download meeting audio'
      )
      return
    }

    try {
      const meetingId = decodeURIComponent(match[1])
      await app.service('meetings').get(meetingId, { user })

      const db = app.get('postgresqlClient')
      const storageClient = app.get('storageClient')
      if (!storageClient) {
        ctx.status = 503
        ctx.body = buildErrorBody(
          'api.meetings.audio_download_storage_unavailable',
          'Meeting audio download is unavailable'
        )
        return
      }

      const recordings = await db('meeting_recordings')
        .where('meeting_id', meetingId)
        .select('*')
      const downloadableRecordings = recordings.filter((recording) => isDownloadableMeetingRecording(recording))

      if (downloadableRecordings.length === 0) {
        ctx.status = 400
        ctx.body = buildErrorBody(
          'api.meetings.audio_download_no_recordings',
          'No downloadable meeting audio is available'
        )
        return
      }

      const zipEntries = []
      for (const recording of downloadableRecordings) {
        try {
          const storedFile = await readStoredFile(storageClient, {
            bucket: recording.storage_bucket,
            key: recording.storage_key
          })
          zipEntries.push({
            buffer: storedFile.buffer,
            name: buildRecordingEntryName(recording)
          })
        } catch {
          ctx.status = 502
          ctx.body = buildErrorBody(
            'api.meetings.audio_download_read_failed',
            'Meeting audio download failed'
          )
          return
        }
      }

      const zipFile = new ZipFile()
      for (const entry of zipEntries) {
        zipFile.addBuffer(entry.buffer, entry.name)
      }
      ctx.set('Content-Type', 'application/zip')
      ctx.set('Content-Disposition', `attachment; filename="meeting-${sanitizeFilenameSegment(meetingId, 'meeting')}-audio.zip"`)
      ctx.body = zipFile.outputStream
      zipFile.end()
    } catch (error) {
      ctx.status = Number(error?.code) || Number(error?.statusCode) || 500
      ctx.body = buildErrorBody(
        error?.data?.error_code || 'api.meetings.audio_download_failed',
        error?.message || 'Unexpected error',
        error?.data?.error_params || {}
      )
    }
  })
}
