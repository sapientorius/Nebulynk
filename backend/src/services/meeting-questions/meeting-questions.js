import { authenticate } from '@feathersjs/authentication'
import { createId } from '@paralleldrive/cuid2'
import { badRequest, notFound } from '../../lib/errors.js'
import { generateStructuredObject } from '../../lib/ai-provider-adapters.js'
import {
  buildQuestionPromptInput,
  hasMeetingAiInput,
  loadMeetingAiContext,
  materializeEvidenceByIds,
  normalizeText
} from '../../lib/meeting-ai.js'
import { getActiveMeetingSummaryRuntime } from '../../lib/meeting-recordings.js'
import { assertCanAccessMeetingContent } from '../../domains/meetings/content-access.js'

function normalizeCitations(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function serializeQuestionRow(row) {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    citations: normalizeCitations(row.citations)
  }
}

function normalizeQuestionDraft(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Meeting question answer must be an object')
  }

  const answer = normalizeText(payload.answer || payload.response)
  if (!answer) {
    throw new Error('Meeting question answer is empty')
  }

  const evidenceIds = Array.isArray(payload.evidence_ids)
    ? payload.evidence_ids.map((item) => normalizeText(item)).filter(Boolean)
    : []

  return {
    language: normalizeText(payload.language) || null,
    answer,
    evidence_ids: evidenceIds
  }
}

async function assertCanAccessEndedMeeting(db, meetingId, user) {
  const meeting = await db('meetings').where('id', meetingId).first()
  if (!meeting) {
    throw notFound('api.meetings.not_found', { meeting_id: meetingId }, 'Meeting nicht gefunden')
  }

  await assertCanAccessMeetingContent(db, { meetingId, meeting, user })

  if (meeting.status !== 'ended') {
    throw badRequest('api.meeting_questions.meeting_not_ended', { meeting_id: meetingId }, 'Ask the Meeting ist erst nach Meeting-Ende verfuegbar')
  }

  return meeting
}

export class MeetingQuestionsService {
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
    const meetingId = normalizeText(params.query?.meeting_id)
    if (!meetingId) {
      throw badRequest('api.meeting_questions.meeting_id_required', {}, 'meeting_id ist erforderlich')
    }

    await assertCanAccessEndedMeeting(this.db, meetingId, params.user)

    const rows = await this.db('meeting_questions')
      .where({
        meeting_id: meetingId,
        user_id: params.user.id
      })
      .orderBy('created_at', 'asc')
      .select('*')

    return {
      data: rows.map((row) => serializeQuestionRow(row)),
      total: rows.length,
      limit: rows.length
    }
  }

  async create(data, params = {}) {
    const meetingId = normalizeText(data?.meeting_id)
    const question = normalizeText(data?.question)
    if (!meetingId) {
      throw badRequest('api.meeting_questions.meeting_id_required', {}, 'meeting_id ist erforderlich')
    }
    if (!question) {
      throw badRequest('api.meeting_questions.question_required', {}, 'question ist erforderlich')
    }

    const meeting = await assertCanAccessEndedMeeting(this.db, meetingId, params.user)
    const runtime = await getActiveMeetingSummaryRuntime(this.db, this.app)
    if (!runtime) {
      throw badRequest('api.ai.function_config_incomplete', { functionKey: 'meeting_summary' }, 'Meeting-Summary-AI ist nicht aktiv konfiguriert')
    }

    const context = await loadMeetingAiContext(this.db, meeting)
    if (!hasMeetingAiInput(context)) {
      throw badRequest('api.meeting_questions.no_context', { meeting_id: meetingId }, 'Fuer dieses Meeting sind keine auswertbaren Inhalte verfuegbar')
    }

    const generateObject = this.app.get('generateStructuredObject') || generateStructuredObject
    const draft = await generateObject({
      providerType: runtime.providerInstance.provider_type,
      apiKey: runtime.apiKey,
      baseUrl: runtime.providerInstance.base_url,
      model: runtime.functionConfig.model,
      systemPrompt: 'You answer follow-up questions about a Nebulynk meeting. Use only the supplied meeting summary, transcript, and chat evidence. Return valid JSON.',
      userPrompt: JSON.stringify({
        instructions: {
          output_rules: [
            'Return valid JSON only.',
            'Answer only from the supplied meeting materials.',
            'If the answer is uncertain, say so plainly.',
            'Cite only evidence ids from the supplied transcript.segments and chat.messages.'
          ],
          shape: {
            language: 'string',
            answer: 'string',
            evidence_ids: ['string']
          }
        },
        context: buildQuestionPromptInput(context, question)
      }, null, 2),
      capability: 'meeting_summary',
      validateObject: normalizeQuestionDraft
    })

    const nowIso = new Date().toISOString()
    const row = {
      id: createId(),
      meeting_id: meetingId,
      user_id: params.user.id,
      question,
      answer: draft.answer,
      language: draft.language,
      citations: materializeEvidenceByIds(draft.evidence_ids, context.evidenceCatalog),
      created_at: nowIso,
      updated_at: nowIso
    }

    await this.db('meeting_questions').insert({
      ...row,
      citations: JSON.stringify(row.citations)
    })
    return serializeQuestionRow(row)
  }
}

export const meetingQuestions = (app) => {
  app.use('meeting-questions', new MeetingQuestionsService({
    Model: app.get('postgresqlClient'),
    app
  }), {
    methods: ['find', 'create'],
    events: []
  })

  app.service('meeting-questions').hooks({
    around: {
      all: [authenticate('jwt')]
    },
    before: {},
    after: {},
    error: {}
  })
}
