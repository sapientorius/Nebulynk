import { createId } from '@paralleldrive/cuid2'
import { authenticate } from '@feathersjs/authentication'
import { uploadFile, deleteFile } from '../../lib/storage.js'
import {
  normalizeVideoBackgroundImage,
  resolveVideoBackgroundMaxPerUser,
  sanitizeVideoBackground,
  sanitizeVideoBackgrounds
} from '../../lib/video-backgrounds.js'
import { generateImage } from '../../lib/ai-provider-adapters.js'
import { getActiveImageGenerationRuntime } from '../../lib/meeting-recordings.js'
import { hasUserPlatformPermission } from '../../lib/user-permissions.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { validate } from '../../schemas/validators.js'
import { createSchema, patchSchema } from './video-backgrounds.schema.js'

function normalizeTitle(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, 120) : null
}

function normalizePrompt(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed ? trimmed.slice(0, 1000) : null
}

async function canManageVideoBackgrounds(app, user) {
  if (!user) return false
  if (user.is_admin) return true
  return hasUserPlatformPermission(app, user.id, 'manage_video_backgrounds')
}

export class VideoBackgroundsService {
  constructor(options) {
    this.options = options
  }

  get app() {
    return this.options.app
  }

  get db() {
    return this.options.Model
  }

  get env() {
    return this.options.env || process.env
  }

  async find(params = {}) {
    const user = params.user
    const manage = await canManageVideoBackgrounds(this.app, user)
    const scope = params.query?.scope || null

    let query = this.db('video_backgrounds').orderBy('created_at', 'desc')
    if (scope === 'global') {
      query = query.where('is_global', true)
    } else if (manage && scope === 'managed') {
      query = query.where((builder) => {
        builder.where('is_global', true).orWhere('user_id', user.id)
      })
    } else {
      query = query.where((builder) => {
        builder.where('user_id', user.id).orWhere('is_global', true)
      })
    }

    const rows = await query.select('*')
    const imageGenerationRuntime = await getActiveImageGenerationRuntime(this.db, this.app)
    return {
      data: sanitizeVideoBackgrounds(rows),
      total: rows.length,
      limit: rows.length,
      image_generation_available: !!imageGenerationRuntime
    }
  }

  async get(id, params = {}) {
    const row = await this.getAccessibleRow(id, params)
    return sanitizeVideoBackground(row)
  }

  async getStoredBackground(id, params = {}) {
    return this.getAccessibleRow(id, params)
  }

  async create(data, params = {}) {
    const user = params.user
    const prompt = normalizePrompt(data.prompt)
    if (!prompt) {
      throw badRequest('api.video_backgrounds.prompt_required', {}, 'Prompt is required')
    }

    const runtime = await getActiveImageGenerationRuntime(this.db, this.app)
    if (!runtime) {
      throw badRequest(
        'api.video_backgrounds.image_generation_unavailable',
        {},
        'Image generation is not configured'
      )
    }

    if (runtime.providerInstance.provider_type !== 'openai') {
      throw badRequest(
        'api.video_backgrounds.image_generation_provider_unsupported',
        { providerType: runtime.providerInstance.provider_type },
        'Only OpenAI image generation is supported'
      )
    }

    const generate = this.app.get('generateImage') || generateImage
    const generated = await generate({
      providerType: runtime.providerInstance.provider_type,
      apiKey: runtime.apiKey,
      baseUrl: runtime.providerInstance.base_url,
      model: runtime.functionConfig.model,
      prompt,
      fetchFn: this.app.get('fetch') || globalThis.fetch
    })

    return this.storeBackground(user, {
      buffer: generated.buffer,
      source: 'generated',
      title: normalizeTitle(data.title) || 'Generated background',
      prompt
    })
  }

  async patch(id, data, params = {}) {
    const user = params.user
    const row = await this.getAccessibleRow(id, params)
    const manage = await canManageVideoBackgrounds(this.app, user)
    const now = new Date().toISOString()
    const patch = { updated_at: now }

    if (Object.prototype.hasOwnProperty.call(data, 'title')) {
      if (row.user_id !== user.id && !manage) {
        throw forbidden(
          'api.video_backgrounds.update_forbidden',
          { id },
          'You cannot update this background'
        )
      }
      patch.title = normalizeTitle(data.title)
    }

    if (Object.prototype.hasOwnProperty.call(data, 'is_global')) {
      if (!manage) {
        throw forbidden(
          'api.video_backgrounds.manage_forbidden',
          { required: ['manage_video_backgrounds'] },
          'Missing permission: manage_video_backgrounds'
        )
      }
      if (row.user_id !== user.id && row.is_global !== true) {
        throw forbidden(
          'api.video_backgrounds.publish_foreign_private_forbidden',
          { id },
          'Private backgrounds can only be published by their owner'
        )
      }
      patch.is_global = data.is_global === true
      patch.published_by = patch.is_global ? user.id : null
      patch.published_at = patch.is_global ? now : null
    }

    await this.db('video_backgrounds').where('id', id).update(patch)
    return this.get(id, params)
  }

  async remove(id, params = {}) {
    const user = params.user
    const row = await this.getAccessibleRow(id, params)
    const manage = await canManageVideoBackgrounds(this.app, user)

    if (row.is_global && !manage) {
      throw forbidden(
        'api.video_backgrounds.manage_forbidden',
        { required: ['manage_video_backgrounds'] },
        'Missing permission: manage_video_backgrounds'
      )
    }
    if (!row.is_global && row.user_id !== user.id) {
      throw forbidden(
        'api.video_backgrounds.delete_forbidden',
        { id },
        'You cannot delete this background'
      )
    }

    await this.deleteRows([row])
    return sanitizeVideoBackground(row)
  }

  async storeUploadedBackground(user, { buffer, title = null } = {}) {
    return this.storeBackground(user, {
      buffer,
      source: 'upload',
      title: normalizeTitle(title),
      prompt: null
    })
  }

  async storeBackground(user, { buffer, source, title = null, prompt = null }) {
    if (!user?.id) {
      throw forbidden('api.video_backgrounds.authentication_required', {}, 'Authentication required')
    }

    const storageClient = this.app.get('storageClient')
    const bucket = this.app.get('storageBucket')
    if (!storageClient || !bucket) {
      throw badRequest(
        'api.video_backgrounds.storage_unavailable',
        {},
        'Background storage unavailable'
      )
    }

    const normalized = await normalizeVideoBackgroundImage(buffer)
    const id = createId()
    const now = new Date().toISOString()
    const storageKey = `video-backgrounds/${user.id}/${id}.webp`

    await uploadFile(storageClient, {
      buffer: normalized.buffer,
      key: storageKey,
      mime: normalized.mimeType,
      bucket
    })

    const row = {
      id,
      user_id: user.id,
      title,
      source,
      is_global: false,
      prompt,
      storage_key: storageKey,
      bucket,
      mime_type: normalized.mimeType,
      size: normalized.size,
      width: normalized.width,
      height: normalized.height,
      published_by: null,
      published_at: null,
      created_at: now,
      updated_at: now
    }

    await this.db('video_backgrounds').insert(row)
    await this.prunePersonalBackgrounds(user.id)
    return sanitizeVideoBackground(row)
  }

  async getAccessibleRow(id, params = {}) {
    const user = params.user
    if (!user?.id) {
      throw forbidden('api.video_backgrounds.authentication_required', {}, 'Authentication required')
    }

    const row = await this.db('video_backgrounds').where('id', id).first()
    if (!row) {
      throw notFound('api.video_backgrounds.not_found', { id }, 'Background not found')
    }

    const manage = await canManageVideoBackgrounds(this.app, user)
    if (row.user_id !== user.id && row.is_global !== true && !manage) {
      throw notFound('api.video_backgrounds.not_found', { id }, 'Background not found')
    }

    return row
  }

  async prunePersonalBackgrounds(userId) {
    const maxPerUser = resolveVideoBackgroundMaxPerUser(this.env)
    const rows = await this.db('video_backgrounds')
      .where({ user_id: userId, is_global: false })
      .orderBy('created_at', 'desc')
      .select('*')

    const staleRows = rows.slice(maxPerUser)
    if (staleRows.length > 0) {
      await this.deleteRows(staleRows)
    }
  }

  async deleteRows(rows) {
    if (!rows.length) return

    const storageClient = this.app.get('storageClient')
    for (const row of rows) {
      if (storageClient && row.storage_key && row.bucket) {
        try {
          await deleteFile(storageClient, { key: row.storage_key, bucket: row.bucket })
        } catch {
          // Best-effort cleanup; metadata deletion remains authoritative.
        }
      }
    }

    const ids = rows.map((row) => row.id)
    await this.db('users')
      .whereRaw("meeting_video_preferences->>'background_image_id' = ANY(?)", [ids])
      .update({
        meeting_video_preferences: this.db.raw(
          "jsonb_set(meeting_video_preferences - 'background_image_id', '{background_mode}', '\"none\"'::jsonb)"
        ),
        updated_at: new Date().toISOString()
      })
    await this.db('video_backgrounds').whereIn('id', ids).delete()
  }
}

export const videoBackgrounds = (app) => {
  app.use('video-backgrounds', new VideoBackgroundsService({
    Model: app.get('postgresqlClient'),
    app
  }), {
    methods: ['find', 'get', 'create', 'patch', 'remove'],
    events: []
  })

  app.service('video-backgrounds').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {
      create: [validate(createSchema)],
      patch: [validate(patchSchema)]
    },
    after: {},
    error: {}
  })
}
