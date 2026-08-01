import formidable from 'formidable'
import { readFile, unlink } from 'fs/promises'
import { buildErrorBody } from '../lib/errors.js'
import { resolveUserPermissions } from '../hooks/check-permission.js'
import { getActiveMeetingSummaryRuntime, getActiveTranscriptionRuntime } from '../lib/meeting-recordings.js'
import { generateStructuredObject, transcribeAudio } from '../lib/ai-provider-adapters.js'
import { logger } from '../logger.js'
import { authenticateRequest } from './authenticate-request.js'

const MAX_VOICE_DRAFT_SIZE = Number(process.env.MAX_FILE_SIZE) || 26214400

function getFieldValue(fields, key) {
  const value = fields?.[key]
  if (Array.isArray(value)) return value[0]
  return value
}

function normalizeDurationMs(value) {
  if (value === undefined || value === null || value === '') return null
  const duration = Number(value)
  if (!Number.isFinite(duration) || duration < 0) return null
  return Math.round(duration)
}

function normalizeComposerText(value) {
  return String(value || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeCleanupDraft(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Voice draft cleanup must return an object')
  }

  const text = normalizeComposerText(payload.text || payload.cleaned_text || payload.message)
  if (!text) {
    throw new Error('Voice draft cleanup must return text')
  }

  return { text }
}

function buildCleanupPrompt({ transcript, language }) {
  return JSON.stringify({
    instructions: {
      output_rules: [
        'Return valid JSON only.',
        'Rewrite the transcript into one polished chat message.',
        'Preserve the speaker intent, language, names, facts, and tone.',
        'Fix grammar, punctuation, and sentence structure.',
        'If the transcript is already clear, change as little as possible.',
        'If the transcript is chaotic, organize it into a concise readable message.',
        'Do not add new facts or explanations.'
      ],
      shape: {
        text: 'string'
      }
    },
    context: {
      language: language || null,
      raw_transcript: transcript
    }
  }, null, 2)
}

export async function polishVoiceDraftTranscript({ app, db, transcript, language = null, log = logger }) {
  const rawText = normalizeComposerText(transcript)
  if (!rawText) {
    return {
      text: '',
      raw_text: '',
      polished: false
    }
  }

  try {
    const runtime = await getActiveMeetingSummaryRuntime(db, app)
    if (!runtime) {
      return {
        text: rawText,
        raw_text: rawText,
        polished: false
      }
    }

    const generateObject = app.get('generateStructuredObject') || generateStructuredObject
    const draft = await generateObject({
      providerType: runtime.providerInstance.provider_type,
      apiKey: runtime.apiKey,
      baseUrl: runtime.providerInstance.base_url,
      model: runtime.functionConfig.model,
      systemPrompt: 'You turn raw voice-to-text transcripts into polished editable Nebulynk chat messages. Return valid JSON only.',
      userPrompt: buildCleanupPrompt({ transcript: rawText, language }),
      capability: 'meeting_summary',
      temperature: 0,
      validateObject: normalizeCleanupDraft
    })

    return {
      text: normalizeComposerText(draft.text),
      raw_text: rawText,
      polished: true
    }
  } catch (error) {
    log.warn?.('Voice draft cleanup failed; falling back to raw transcript:', { error: error.message })
    return {
      text: rawText,
      raw_text: rawText,
      polished: false
    }
  }
}

async function assertDraftAccess(app, { user, channelId }) {
  const db = app.get('postgresqlClient')
  const channel = await db('channels').where('id', channelId).first()
  if (!channel) {
    return {
      status: 404,
      body: buildErrorBody('api.channels.not_found', 'Channel not found')
    }
  }

  if (channel.is_archived) {
    return {
      status: 400,
      body: buildErrorBody('api.messages.channel_archived', 'Channel is archived')
    }
  }

  if (!user.is_admin) {
    const membership = await db('channel_members')
      .where({
        channel_id: channelId,
        user_id: user.id
      })
      .first()

    if (!membership) {
      return {
        status: 403,
        body: buildErrorBody('api.channels.membership_required', 'You are not a member of this channel', { channel_id: channelId })
      }
    }

    if (channel.type !== 'dm' && channel.type !== 'group') {
      const permissionResult = await resolveUserPermissions(app, user.id, channelId)
      if (!permissionResult.permissions.includes('send_messages')) {
        return {
          status: 403,
          body: buildErrorBody('api.permissions.missing_required_permission', 'Missing permission: send_messages', { required: ['send_messages'] })
        }
      }
    }
  }

  return null
}

export function configureVoiceDraftRoutes(app) {
  const koaApp = app

  koaApp.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== '/voice-drafts/transcribe') {
      return next()
    }

    const user = await authenticateRequest(app, ctx, {
      authRequiredCode: 'api.voice_drafts.authentication_required',
      invalidTokenCode: 'api.voice_drafts.invalid_token'
    })
    if (!user) return

    const form = formidable({
      maxFileSize: MAX_VOICE_DRAFT_SIZE,
      keepExtensions: true
    })

    let uploadedFile
    try {
      let fields, files
      try {
        ;[fields, files] = await form.parse(ctx.req)
      } catch (error) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.voice_drafts.multipart_parse_failed', `Voice draft failed: ${error.message}`)
        return
      }

      uploadedFile = files.file?.[0]
      if (!uploadedFile) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.voice_drafts.no_file_provided', 'No file provided')
        return
      }

      if (!uploadedFile.mimetype?.startsWith('audio/')) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.voice_drafts.audio_required', 'Voice drafts must be audio files')
        return
      }

      const channelId = String(getFieldValue(fields, 'channel_id') || '').trim()
      if (!channelId) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.voice_drafts.channel_id_required', 'channel_id is required')
        return
      }

      const accessError = await assertDraftAccess(app, { user, channelId })
      if (accessError) {
        ctx.status = accessError.status
        ctx.body = accessError.body
        return
      }

      const runtime = await getActiveTranscriptionRuntime(app.get('postgresqlClient'), app)
      if (!runtime) {
        ctx.status = 400
        ctx.body = buildErrorBody('api.ai.function_config_incomplete', 'Transcription AI is not actively configured', { functionKey: 'transcription' })
        return
      }

      const buffer = await readFile(uploadedFile.filepath)
      const transcribe = app.get('transcribeAudio') || transcribeAudio
      const transcript = await transcribe({
        providerType: runtime.providerInstance.provider_type,
        apiKey: runtime.apiKey,
        baseUrl: runtime.providerInstance.base_url,
        model: runtime.functionConfig.model,
        file: {
          buffer,
          mime: uploadedFile.mimetype
        }
      })
      const durationMs = normalizeDurationMs(getFieldValue(fields, 'duration_ms')) || transcript.duration_ms || null
      const polishedDraft = await polishVoiceDraftTranscript({
        app,
        db: app.get('postgresqlClient'),
        transcript: transcript.text,
        language: transcript.language || null
      })

      ctx.status = 200
      ctx.body = {
        text: polishedDraft.text,
        raw_text: polishedDraft.raw_text,
        polished: polishedDraft.polished,
        language: transcript.language || null,
        duration_ms: durationMs
      }
    } catch (error) {
      logger.error('Voice draft transcription failed:', { error: error.message })
      ctx.status = Number(error?.code) || Number(error?.statusCode) || 500
      ctx.body = buildErrorBody(
        error?.data?.error_code || error?.error_code || 'api.voice_drafts.transcription_failed',
        error.message || 'Voice draft transcription failed',
        error?.data?.error_params || error?.error_params || {}
      )
    } finally {
      if (uploadedFile?.filepath) {
        try {
          await unlink(uploadedFile.filepath)
        } catch {
          // Ignore temp cleanup errors.
        }
      }
    }
  })
}
