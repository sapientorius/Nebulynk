import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { readStoredFile } from '../../lib/storage.js'
import { transcribeAudio, generateStructuredObject } from '../../lib/ai-provider-adapters.js'
import {
  getActiveMeetingSummaryRuntime,
  getActiveTranscriptionRuntime
} from '../../lib/meeting-recordings.js'
import { createSchema } from './voice-message-artifacts.schema.js'

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeSummaryDraft(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Voice message summary draft must be an object')
  }

  const summary = normalizeText(payload.summary || payload.mini_summary)
  const keyPoints = asArray(payload.key_points || payload.summary_points)
    .map((item) => normalizeText(typeof item === 'string' ? item : item?.text))
    .filter(Boolean)
    .slice(0, 5)

  return {
    summary: summary || keyPoints[0] || null,
    key_points: keyPoints
  }
}

function buildSummaryPrompt({ transcript, authorDisplayName }) {
  return JSON.stringify({
    instructions: {
      output_rules: [
        'Return valid JSON only.',
        'Use only the supplied voice message transcript.',
        'Keep the summary to one or two concise sentences.',
        'Return up to five short key_points.'
      ],
      shape: {
        summary: 'string',
        key_points: ['string']
      }
    },
    context: {
      author_display_name: authorDisplayName || null,
      transcript
    }
  }, null, 2)
}

function buildFailurePatch(error) {
  return {
    status: 'failed',
    failure_code: error?.data?.error_code || error?.error_code || 'voice_message_artifact_failed',
    failure_message: error?.message || 'Voice message artifact generation failed',
    updated_at: new Date().toISOString()
  }
}

export class VoiceMessageArtifactsService {
  constructor(options) {
    this.options = options
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  async find(params = {}) {
    const userId = params.user?.id
    if (!userId) {
      throw forbidden('api.voice_messages.authentication_required', {}, 'Authentication required')
    }

    let query = this.db('voice_message_artifacts')
      .where('user_id', userId)

    if (params.query?.message_id) {
      query = query.where('message_id', params.query.message_id)
    }
    if (params.query?.file_id) {
      query = query.where('file_id', params.query.file_id)
    }

    const rows = await query.orderBy('updated_at', 'desc').select('*')
    return {
      data: rows,
      total: rows.length,
      limit: rows.length
    }
  }

  async get(id, params = {}) {
    const userId = params.user?.id
    if (!userId) {
      throw forbidden('api.voice_messages.authentication_required', {}, 'Authentication required')
    }

    const artifact = await this.db('voice_message_artifacts')
      .where({
        id,
        user_id: userId
      })
      .first()

    if (!artifact) {
      throw notFound('api.voice_messages.artifact_not_found', { id }, 'Voice message artifact not found')
    }

    return artifact
  }

  async create(data, params = {}) {
    const userId = params.user?.id
    if (!userId) {
      throw forbidden('api.voice_messages.authentication_required', {}, 'Authentication required')
    }

    const access = await this.resolveArtifactAccess({
      messageId: data.message_id,
      fileId: data.file_id,
      params
    })

    const existing = await this.db('voice_message_artifacts')
      .where({
        file_id: access.file.id,
        user_id: userId
      })
      .first()

    if (existing?.status === 'ready' && data.retry !== true) {
      return existing
    }

    const nowIso = new Date().toISOString()
    let artifactId = existing?.id || createId()

    if (existing) {
      await this.db('voice_message_artifacts')
        .where('id', existing.id)
        .update({
          message_id: access.message.id,
          status: 'processing',
          transcript: null,
          summary: null,
          language: null,
          payload: null,
          failure_code: null,
          failure_message: null,
          updated_at: nowIso
        })
    } else {
      await this.db('voice_message_artifacts').insert({
        id: artifactId,
        message_id: access.message.id,
        file_id: access.file.id,
        user_id: userId,
        status: 'processing',
        transcript: null,
        summary: null,
        language: null,
        payload: null,
        failure_code: null,
        failure_message: null,
        created_at: nowIso,
        updated_at: nowIso
      })
    }

    try {
      await this.processArtifact({
        artifactId,
        file: access.file,
        message: access.message
      })
    } catch (error) {
      await this.db('voice_message_artifacts')
        .where('id', artifactId)
        .update(buildFailurePatch(error))
    }

    return this.get(artifactId, params)
  }

  async resolveArtifactAccess({ messageId, fileId, params }) {
    const message = await this.db('messages')
      .where('id', messageId)
      .first()

    if (!message || message.deleted_at) {
      throw notFound('api.messages.message_not_found', {}, 'Nachricht nicht gefunden')
    }

    if (message.user_id) {
      const author = await this.db('users').where('id', message.user_id).first()
      message.user_display_name = author?.display_name || null
    }

    await this.assertReadableChannel(message.channel_id, params)

    const file = await this.db('files')
      .where({
        id: fileId,
        message_id: message.id
      })
      .first()

    if (!file) {
      throw notFound('api.files.file_not_found', {}, 'Datei nicht gefunden')
    }

    if (file.purpose !== 'voice_message' || !file.mime_type?.startsWith('audio/')) {
      throw badRequest(
        'api.voice_messages.voice_file_required',
        { file_id: fileId },
        'Voice-message artifacts require a voice-message audio file'
      )
    }

    return { message, file }
  }

  async assertReadableChannel(channelId, params = {}) {
    const user = params.user
    if (!user?.id) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }

    if (user.is_admin) return

    const membership = await this.db('channel_members')
      .where({
        channel_id: channelId,
        user_id: user.id
      })
      .first()

    if (!membership) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }
  }

  async processArtifact({ artifactId, file, message }) {
    const storageClient = this.app.get('storageClient')
    if (!storageClient) {
      throw badRequest('api.voice_messages.storage_unavailable', {}, 'Voice message storage is unavailable')
    }

    const transcriptionRuntime = await getActiveTranscriptionRuntime(this.db, this.app)
    if (!transcriptionRuntime) {
      throw badRequest(
        'api.ai.function_config_incomplete',
        { functionKey: 'transcription' },
        'Transcription AI is not actively configured'
      )
    }

    const summaryRuntime = await getActiveMeetingSummaryRuntime(this.db, this.app)
    if (!summaryRuntime) {
      throw badRequest(
        'api.ai.function_config_incomplete',
        { functionKey: 'meeting_summary' },
        'Summary AI is not actively configured'
      )
    }

    const storedFile = await readStoredFile(storageClient, {
      key: file.storage_key,
      bucket: file.bucket
    })
    const transcribe = this.app.get('transcribeAudio') || transcribeAudio
    const generateObject = this.app.get('generateStructuredObject') || generateStructuredObject

    const transcriptResult = await transcribe({
      providerType: transcriptionRuntime.providerInstance.provider_type,
      apiKey: transcriptionRuntime.apiKey,
      baseUrl: transcriptionRuntime.providerInstance.base_url,
      model: transcriptionRuntime.functionConfig.model,
      file: {
        buffer: storedFile.buffer,
        mime: storedFile.mime || file.mime_type
      }
    })

    const transcript = normalizeText(transcriptResult.text)
    if (!transcript) {
      throw new Error('Voice message transcription returned no text')
    }

    const draft = await generateObject({
      providerType: summaryRuntime.providerInstance.provider_type,
      apiKey: summaryRuntime.apiKey,
      baseUrl: summaryRuntime.providerInstance.base_url,
      model: summaryRuntime.functionConfig.model,
      systemPrompt: 'You create concise private summaries of short voice messages for Nebulynk. Use only the supplied transcript and return valid JSON.',
      userPrompt: buildSummaryPrompt({
        transcript,
        authorDisplayName: message.user_display_name || null
      }),
      capability: 'meeting_summary',
      validateObject: normalizeSummaryDraft
    })

    const nowIso = new Date().toISOString()
    const payload = {
      transcript,
      language: transcriptResult.language || null,
      summary: draft.summary,
      key_points: draft.key_points,
      duration_ms: file.duration_ms || transcriptResult.duration_ms || null
    }

    await this.db('voice_message_artifacts')
      .where('id', artifactId)
      .update({
        status: 'ready',
        transcript,
        summary: draft.summary,
        language: transcriptResult.language || null,
        payload,
        failure_code: null,
        failure_message: null,
        updated_at: nowIso
      })
  }
}

export const voiceMessageArtifacts = (app) => {
  app.use('voice-message-artifacts', new VoiceMessageArtifactsService({
    Model: app.get('postgresqlClient'),
    app
  }), {
    methods: ['find', 'get', 'create'],
    events: []
  })

  app.service('voice-message-artifacts').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)]
    },
    after: {},
    error: {}
  })
}
