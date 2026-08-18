import { authenticate } from '@feathersjs/authentication'
import { logger } from '../../logger.js'

function normalizeGifResult(item) {
  return {
    id: item.id,
    url: item.media_formats?.gif?.url || '',
    preview_url: item.media_formats?.tinygif?.url || '',
    width: item.media_formats?.gif?.dims?.[0] || 0,
    height: item.media_formats?.gif?.dims?.[1] || 0,
    description: item.content_description || ''
  }
}

export class GifsService {
  constructor(options = {}) {
    this.options = options
  }

  get env() {
    return this.options.env || process.env
  }

  get fetchFn() {
    return this.options.fetchFn || globalThis.fetch
  }

  get logger() {
    return this.options.logger || logger
  }

  async resolveApiKey() {
    if (this.options.klipySettings?.resolveApiKey) {
      return this.options.klipySettings.resolveApiKey()
    }
    return typeof this.env.KLIPY_API_KEY === 'string' ? this.env.KLIPY_API_KEY.trim() : ''
  }

  async find(params = {}) {
    const apiKey = await this.resolveApiKey()
    if (!apiKey) {
      return { data: [] }
    }

    const q = params.query?.q || ''
    const limit = Math.min(params.query?.limit || 20, 50)

    const endpoint = q
      ? `https://api.klipy.com/v2/search?q=${encodeURIComponent(q)}&key=${apiKey}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`
      : `https://api.klipy.com/v2/featured?key=${apiKey}&limit=${limit}&media_filter=gif,tinygif&contentfilter=medium`

    const response = await this.fetchFn(endpoint)
    this.logger.debug('KLIPY API response', { ok: response.ok, status: response.status })
    if (!response.ok) {
      return { data: [] }
    }

    const json = await response.json()
    return {
      data: (json.results || []).map(normalizeGifResult)
    }
  }

  async get(id) {
    const apiKey = await this.resolveApiKey()
    if (!apiKey) return null

    const response = await this.fetchFn(
      `https://api.klipy.com/v2/posts?key=${apiKey}&ids=${encodeURIComponent(id)}&media_filter=gif,tinygif`
    )
    if (!response.ok) return null

    const json = await response.json()
    const item = json.results?.[0]
    if (!item) return null

    return normalizeGifResult(item)
  }
}

export const gifs = (app) => {
  app.use('gifs', new GifsService({
    klipySettings: app.get('klipySettings')
  }), {
    methods: ['find', 'get'],
    events: []
  })

  const service = app.service('gifs')

  service.hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {},
    after: {},
    error: {}
  })
}
