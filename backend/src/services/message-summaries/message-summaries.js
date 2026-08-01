import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { validate } from '../../schemas/validators.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { generateStructuredObject } from '../../lib/ai-provider-adapters.js'
import { getActiveChatSummaryRuntime } from '../../lib/meeting-recordings.js'
import { createSchema } from './message-summaries.schema.js'

export const DEFAULT_MESSAGE_SUMMARY_MIN_CHARS = 400
export const DEFAULT_MESSAGE_SUMMARY_MAX_CONTEXT_CHARS = 60000
export const MESSAGE_SUMMARY_MAX_MESSAGES = 100

function getMinChars() {
  const configured = Number(process.env.MESSAGE_SUMMARY_MIN_CHARS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MESSAGE_SUMMARY_MIN_CHARS
  return Math.round(configured)
}

function getMaxContextChars() {
  const configured = Number(process.env.MESSAGE_SUMMARY_MAX_CONTEXT_CHARS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MESSAGE_SUMMARY_MAX_CONTEXT_CHARS
  return Math.round(configured)
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function parseJsonValue(value, fallback) {
  if (value === null || typeof value === 'undefined') return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function serializeJsonValue(value) {
  if (value === null || typeof value === 'undefined') return null
  return JSON.stringify(value)
}

function sortByCreatedAt(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || 0)
    const rightTime = Date.parse(right?.created_at || 0)
    if (leftTime !== rightTime) return leftTime - rightTime
    return String(left?.id || '').localeCompare(String(right?.id || ''))
  })
}

function uniqueIds(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))]
}

function parseWindowTimestamp(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return null
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? normalized : null
}

function parseSummaryTimelineTimestamp(value) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function hasSummaryRange(summary) {
  return Boolean(summary?.source_started_at && summary?.source_ended_at)
}

function getExpectedSummaryMessageCount(summary, sourceMessageIds = []) {
  const storedCount = Number(summary?.message_count)
  if (Number.isFinite(storedCount) && storedCount > 0 && storedCount === sourceMessageIds.length) {
    return null
  }
  return sourceMessageIds.length > 0 ? sourceMessageIds.length : null
}

function getSummaryWindowRange(summary) {
  return {
    startAt: summary?.source_started_at
      || summary?.source_ended_at
      || summary?.created_at
      || summary?.updated_at
      || null,
    endAt: summary?.source_ended_at
      || summary?.source_started_at
      || summary?.created_at
      || summary?.updated_at
      || null
  }
}

function summaryOverlapsWindow(summary, window) {
  if (!window?.startAt || !window?.endAt) return true
  const { startAt, endAt } = getSummaryWindowRange(summary)
  const summaryStartTime = parseSummaryTimelineTimestamp(startAt)
  const summaryEndTime = parseSummaryTimelineTimestamp(endAt)
  const windowStartTime = parseSummaryTimelineTimestamp(window.startAt)
  const windowEndTime = parseSummaryTimelineTimestamp(window.endAt)

  if (!summaryStartTime || !summaryEndTime || !windowStartTime || !windowEndTime) return true
  return summaryEndTime >= windowStartTime && summaryStartTime <= windowEndTime
}

function serializeSummary(row) {
  if (!row) return row
  const sourceMessageIds = parseJsonValue(row.source_message_ids, [])
  const payload = parseJsonValue(row.payload, null)
  return {
    ...row,
    source_message_ids: asArray(sourceMessageIds),
    payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  }
}

function serializeSummaryForDb(row) {
  return {
    ...row,
    payload: serializeJsonValue(row.payload),
    source_message_ids: serializeJsonValue(asArray(row.source_message_ids))
  }
}

function serializeSummaryPatchForDb(patch) {
  const nextPatch = { ...patch }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'payload')) {
    nextPatch.payload = serializeJsonValue(nextPatch.payload)
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'source_message_ids')) {
    nextPatch.source_message_ids = serializeJsonValue(asArray(nextPatch.source_message_ids))
  }
  return nextPatch
}

function normalizeSummaryDraft(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Chat summary draft must be an object')
  }

  const summaryPoints = asArray(payload.summary_points || payload.key_points)
    .map((item) => normalizeText(typeof item === 'string' ? item : item?.text))
    .filter(Boolean)
    .slice(0, 8)
  const miniSummary = normalizeText(payload.mini_summary || payload.summary)

  return {
    language: normalizeText(payload.language) || null,
    mini_summary: miniSummary || summaryPoints[0] || null,
    summary_points: summaryPoints
  }
}

function buildPrompt({ channel, scope, messages }) {
  return JSON.stringify({
    instructions: {
      output_rules: [
        'Return valid JSON only.',
        'Use only the supplied chat messages.',
        'Keep mini_summary to one short paragraph.',
        'Return up to eight concise business-focused summary_points.',
        'Do not invent decisions, facts, or people.'
      ],
      shape: {
        language: 'string',
        mini_summary: 'string',
        summary_points: ['string']
      }
    },
    context: {
      scope,
      channel: {
        id: channel.id,
        name: channel.name || null,
        type: channel.type || null
      },
      messages: messages.map((message) => ({
        id: message.id,
        author_display_name: message.user_display_name || 'Unknown author',
        created_at: message.created_at || null,
        text: normalizeText(message.content)
      }))
    }
  }, null, 2)
}

function buildReadyPayload({ draft, sourceMessages, minChars }) {
  const contextChars = sourceMessages.reduce((sum, message) => sum + normalizeText(message.content).length, 0)
  const payload = {
    language: draft.language,
    mini_summary: draft.mini_summary,
    summary_points: draft.summary_points,
    coverage: {
      message_count: sourceMessages.length,
      author_count: new Set(sourceMessages.map((message) => message.user_id).filter(Boolean)).size,
      min_chars: minChars,
      context_chars: contextChars,
      max_context_chars: getMaxContextChars()
    }
  }
  payload.markdown = [
    payload.mini_summary,
    ...payload.summary_points.map((point) => `- ${point}`)
  ].filter(Boolean).join('\n\n').trim()
  return payload
}

function buildFailurePatch(error) {
  return {
    status: 'failed',
    failure_code: error?.data?.error_code || error?.error_code || 'message_summary_failed',
    failure_message: error?.message || 'Message summary generation failed',
    updated_at: new Date().toISOString()
  }
}

function rangeHoursFromInput(data = {}) {
  if (data.range_preset === 'last_hour') return 1
  if (data.range_preset === 'last_24h') return 24
  if (data.range_preset === 'last_48h') return 48
  if (data.range_preset === 'last_7d') return 24 * 7

  if (data.range_preset !== 'custom') {
    throw badRequest(
      'api.message_summaries.range_required',
      {},
      'range_preset is required for range summaries'
    )
  }

  const value = Number(data.range_value)
  const unit = data.range_unit
  const hours = unit === 'days' ? value * 24 : value
  if (!Number.isFinite(hours) || hours <= 0) {
    throw badRequest(
      'api.message_summaries.range_invalid',
      {},
      'Custom summary ranges must be positive'
    )
  }
  return Math.round(hours)
}

export class MessageSummariesService {
  constructor(options) {
    this.options = options
    this.generateId = options.generateId || createId
    this.now = options.now || (() => new Date())
  }

  get db() {
    return this.options.Model
  }

  get app() {
    return this.options.app
  }

  getSummaryWindow(params = {}) {
    const rawStartAt = params.query?.window_start_at
    const rawEndAt = params.query?.window_end_at
    const hasStartAt = typeof rawStartAt === 'string' && rawStartAt.trim()
    const hasEndAt = typeof rawEndAt === 'string' && rawEndAt.trim()

    if (!hasStartAt && !hasEndAt) return null
    if (!hasStartAt || !hasEndAt) {
      throw badRequest(
        'api.message_summaries.window_pair_required',
        {},
        'window_start_at and window_end_at are required together'
      )
    }

    const startAt = parseWindowTimestamp(rawStartAt)
    const endAt = parseWindowTimestamp(rawEndAt)
    if (!startAt || !endAt) {
      throw badRequest(
        'api.message_summaries.window_invalid',
        {},
        'Summary window timestamps must be valid ISO date strings'
      )
    }

    if (parseSummaryTimelineTimestamp(startAt) > parseSummaryTimelineTimestamp(endAt)) {
      throw badRequest(
        'api.message_summaries.window_invalid',
        {},
        'window_start_at must not be after window_end_at'
      )
    }

    return { startAt, endAt }
  }

  async find(params = {}) {
    const userId = this.assertAuthenticated(params)
    const channelId = params.query?.channel_id
    const window = this.getSummaryWindow(params)
    if (!channelId) {
      throw badRequest('api.message_summaries.channel_id_required', {}, 'channel_id is required')
    }
    await this.assertReadableChannel(channelId, params)

    const rows = await this.db('message_summaries')
      .where({
        channel_id: channelId,
        user_id: userId
      })
      .orderBy('created_at', 'asc')
      .select('*')

    const summaries = []
    for (const row of rows) {
      const summary = await this.repairLegacySummaryRow(row)
      if (summaryOverlapsWindow(summary, window)) {
        summaries.push(summary)
      }
    }

    return {
      data: summaries,
      total: summaries.length,
      limit: summaries.length
    }
  }

  async get(id, params = {}) {
    const userId = this.assertAuthenticated(params)
    const row = await this.db('message_summaries')
      .where({
        id,
        user_id: userId
      })
      .first()

    if (!row) {
      throw notFound('api.message_summaries.not_found', { id }, 'Message summary not found')
    }

    await this.assertReadableChannel(row.channel_id, params)
    return this.repairLegacySummaryRow(row)
  }

  async create(data, params = {}) {
    const userId = this.assertAuthenticated(params)
    const channel = await this.assertReadableChannel(data.channel_id, params)
    const source = await this.resolveSourceMessages(data, channel)
    const nowIso = this.now().toISOString()
    const id = this.generateId()
    const row = {
      id,
      channel_id: channel.id,
      user_id: userId,
      scope: data.scope,
      status: 'processing',
      summary: null,
      payload: null,
      source_message_ids: source.messages.map((message) => message.id),
      source_started_at: source.messages[0]?.created_at || null,
      source_ended_at: source.messages[source.messages.length - 1]?.created_at || null,
      message_count: source.messages.length,
      failure_code: null,
      failure_message: null,
      created_at: nowIso,
      updated_at: nowIso
    }

    await this.db('message_summaries').insert(serializeSummaryForDb(row))
    const result = serializeSummary(row)
    this.processSummary({ summaryId: id, channel, sourceMessages: source.messages }).catch(() => {})
    return result
  }

  async remove(id, params = {}) {
    const userId = this.assertAuthenticated(params)
    const row = await this.db('message_summaries')
      .where({
        id,
        user_id: userId
      })
      .first()

    if (!row) {
      throw notFound('api.message_summaries.not_found', { id }, 'Message summary not found')
    }

    await this.assertReadableChannel(row.channel_id, params)
    await this.db('message_summaries')
      .where({
        id,
        user_id: userId
      })
      .del()

    return serializeSummary(row)
  }

  assertAuthenticated(params = {}) {
    const userId = params.user?.id
    if (!userId) {
      throw forbidden('api.message_summaries.authentication_required', {}, 'Authentication required')
    }
    return userId
  }

  async assertReadableChannel(channelId, params = {}) {
    const user = params.user
    if (!channelId || !user?.id) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }

    const channel = await this.db('channels').where('id', channelId).first()
    if (!channel) {
      throw notFound('api.channels.channel_not_found', { channel_id: channelId }, 'Channel not found')
    }

    if (user.is_admin) return channel

    const membership = await this.db('channel_members')
      .where({
        channel_id: channelId,
        user_id: user.id
      })
      .first()

    if (!membership) {
      throw forbidden('api.channels.membership_required', { channel_id: channelId }, 'You are not a member of this channel')
    }

    return channel
  }

  async resolveSourceMessages(data, channel) {
    if (data.scope === 'message') {
      if (!data.message_id) {
        throw badRequest('api.message_summaries.message_id_required', {}, 'message_id is required')
      }
      const message = await this.db('messages').where('id', data.message_id).first()
      const messages = await this.prepareMessages([message], channel.id, { expectCount: 1, requireSingleThreshold: true })
      return { messages }
    }

    if (data.scope === 'selection') {
      const ids = uniqueIds(data.message_ids)
      if (ids.length < 2 || ids.length > MESSAGE_SUMMARY_MAX_MESSAGES) {
        throw badRequest(
          'api.message_summaries.selection_invalid',
          { max_messages: MESSAGE_SUMMARY_MAX_MESSAGES },
          'Select between two and one hundred messages'
        )
      }
      const rows = await this.db('messages').whereIn('id', ids).select('*')
      const messages = await this.prepareMessages(rows, channel.id, { expectCount: ids.length })
      return { messages }
    }

    if (data.scope === 'range') {
      const hours = rangeHoursFromInput(data)
      const now = this.now()
      const sinceTime = now.getTime() - hours * 60 * 60 * 1000
      const sinceIso = Number.isFinite(sinceTime)
        ? new Date(Math.max(0, sinceTime)).toISOString()
        : new Date(0).toISOString()
      const rows = await this.db('messages')
        .where('channel_id', channel.id)
        .whereNull('deleted_at')
        .where('created_at', '>=', sinceIso)
        .select('*')
      const messages = await this.prepareMessages(rows, channel.id, {
        allowEmpty: false,
        allowTrimToContextLimit: true,
        maxMessages: MESSAGE_SUMMARY_MAX_MESSAGES
      })
      return { messages }
    }

    throw badRequest('api.message_summaries.scope_invalid', {}, 'Invalid summary scope')
  }

  async prepareMessages(rawMessages, channelId, options = {}) {
    let rows = sortByCreatedAt(asArray(rawMessages).filter((message) => (
      message
      && message.channel_id === channelId
      && !message.deleted_at
      && message.type !== 'system'
      && normalizeText(message.content)
    )))

    if (options.expectCount && rows.length !== options.expectCount) {
      throw badRequest('api.message_summaries.source_messages_invalid', {}, 'One or more messages cannot be summarized')
    }
    if (!options.allowEmpty && rows.length === 0) {
      throw badRequest('api.message_summaries.no_source_messages', {}, 'No messages are available for summarization')
    }

    if (options.maxMessages && rows.length > options.maxMessages) {
      rows = rows.slice(-options.maxMessages)
    }

    const minChars = getMinChars()
    const maxContextChars = getMaxContextChars()
    let totalChars = rows.reduce((sum, message) => sum + normalizeText(message.content).length, 0)
    if (totalChars < minChars) {
      throw badRequest(
        'api.message_summaries.source_too_short',
        { min_chars: minChars },
        'The selected messages are too short to summarize'
      )
    }
    if (options.requireSingleThreshold && normalizeText(rows[0]?.content).length < minChars) {
      throw badRequest(
        'api.message_summaries.source_too_short',
        { min_chars: minChars },
        'The message is too short to summarize'
      )
    }
    if (totalChars > maxContextChars) {
      if (!options.allowTrimToContextLimit) {
        throw badRequest(
          'api.message_summaries.source_too_large',
          { max_chars: maxContextChars },
          'The selected messages exceed the summary context limit'
        )
      }

      const selected = []
      let selectedChars = 0
      for (const message of [...rows].reverse()) {
        const length = normalizeText(message.content).length
        if (length > maxContextChars || selectedChars + length > maxContextChars) continue
        selected.unshift(message)
        selectedChars += length
      }
      rows = selected
      totalChars = selectedChars

      if (rows.length === 0 || totalChars < minChars) {
        throw badRequest(
          'api.message_summaries.source_too_large',
          { max_chars: maxContextChars },
          'No source messages fit within the summary context limit'
        )
      }
    }

    const userIds = uniqueIds(rows.map((message) => message.user_id))
    let users = []
    if (userIds.length > 0) {
      users = await this.db('users').whereIn('id', userIds).select('id', 'display_name')
    }
    const usersById = Object.fromEntries(users.map((user) => [user.id, user]))

    return rows.map((message) => ({
      ...message,
      user_display_name: usersById[message.user_id]?.display_name || message.user_display_name || null
    }))
  }

  async processSummary({ summaryId, channel, sourceMessages }) {
    try {
      const runtime = await getActiveChatSummaryRuntime(this.db, this.app)
      if (!runtime) {
        throw badRequest(
          'api.ai.function_config_incomplete',
          { functionKey: 'chat_summary' },
          'Chat summary AI is not actively configured'
        )
      }

      const generateObject = this.app.get('generateStructuredObject') || generateStructuredObject
      const draft = await generateObject({
        providerType: runtime.providerInstance.provider_type,
        apiKey: runtime.apiKey,
        baseUrl: runtime.providerInstance.base_url,
        model: runtime.functionConfig.model,
        systemPrompt: 'You create concise private chat summaries for Nebulynk. Use only the supplied chat messages and return valid JSON.',
        userPrompt: buildPrompt({
          channel,
          scope: sourceMessages.length === 1 ? 'message' : 'messages',
          messages: sourceMessages
        }),
        capability: 'meeting_summary',
        validateObject: normalizeSummaryDraft
      })
      const minChars = getMinChars()
      const payload = buildReadyPayload({ draft, sourceMessages, minChars })
      if (!payload.mini_summary && payload.summary_points.length === 0) {
        throw new Error('Chat summary model returned an empty response')
      }

      await this.updateSummary(summaryId, {
        status: 'ready',
        summary: payload.mini_summary || payload.summary_points[0] || null,
        payload,
        failure_code: null,
        failure_message: null,
        updated_at: new Date().toISOString()
      })
    } catch (error) {
      await this.updateSummary(summaryId, buildFailurePatch(error))
    }
  }

  async repairLegacySummaryRow(row) {
    const summary = serializeSummary(row)
    if (hasSummaryRange(summary)) return summary

    const sourceMessageIds = uniqueIds(summary.source_message_ids)
    if (sourceMessageIds.length === 0) return summary

    const sourceMessages = sortByCreatedAt(await this.db('messages')
      .where('channel_id', summary.channel_id)
      .whereIn('id', sourceMessageIds)
      .whereNull('deleted_at')
      .select('id', 'created_at'))

    const patch = {}
    if (!summary.source_started_at && sourceMessages[0]?.created_at) {
      patch.source_started_at = sourceMessages[0].created_at
    }
    if (!summary.source_ended_at && sourceMessages[sourceMessages.length - 1]?.created_at) {
      patch.source_ended_at = sourceMessages[sourceMessages.length - 1].created_at
    }

    const expectedMessageCount = getExpectedSummaryMessageCount(summary, sourceMessageIds)
    if (expectedMessageCount !== null) {
      patch.message_count = expectedMessageCount
    }

    if (Object.keys(patch).length === 0) return summary

    await this.db('message_summaries')
      .where('id', summary.id)
      .update(patch)

    return {
      ...summary,
      ...patch
    }
  }

  async updateSummary(summaryId, patch) {
    await this.db('message_summaries')
      .where('id', summaryId)
      .update(serializeSummaryPatchForDb(patch))

    const row = await this.db('message_summaries').where('id', summaryId).first()
    if (row) {
      this.app.service('message-summaries').emit('patched', serializeSummary(row))
    }
  }
}

export const messageSummaries = (app) => {
  app.use('message-summaries', new MessageSummariesService({
    Model: app.get('postgresqlClient'),
    app
  }), {
    methods: ['find', 'get', 'create', 'remove'],
    events: ['patched']
  })

  app.service('message-summaries').hooks({
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
