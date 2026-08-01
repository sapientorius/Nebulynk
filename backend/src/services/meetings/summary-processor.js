import { upsertMeetingArtifactSearchDocument } from '../../lib/search-index.js'
import { generateStructuredObject } from '../../lib/ai-provider-adapters.js'
import {
  buildMeetingSummaryMarkdown,
  buildSummaryPromptInput,
  hasMeetingAiInput,
  loadMeetingAiContext,
  materializeEvidenceByIds,
  normalizeText
} from '../../lib/meeting-ai.js'
import {
  getActiveMeetingSummaryRuntime,
  getManualMeetingSummaryRuntime
} from '../../lib/meeting-recordings.js'

const SUMMARY_POLL_LIMIT = 10
const SUMMARY_ARTIFACTS_IN_FLIGHT = new Set()

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeEvidenceIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean)
  }
  if (typeof value === 'string') {
    const normalized = normalizeText(value)
    return normalized ? [normalized] : []
  }
  return []
}

function normalizeSummaryDraft(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Meeting summary draft must be an object')
  }

  const summaryPoints = asArray(payload.summary_points)
    .map((item) => normalizeText(typeof item === 'string' ? item : item?.text))
    .filter(Boolean)
    .slice(0, 8)

  const decisions = asArray(payload.decisions)
    .map((item, index) => {
      const text = normalizeText(item?.text || item?.decision)
      if (!text) return null
      return {
        id: `decision-${index + 1}`,
        text,
        evidence_ids: normalizeEvidenceIds(item?.evidence_ids || item?.evidence)
      }
    })
    .filter(Boolean)
    .slice(0, 8)

  const openItems = asArray(payload.open_items)
    .map((item, index) => {
      const text = normalizeText(item?.text || item?.question || item?.risk)
      if (!text) return null
      return {
        id: `open-${index + 1}`,
        kind: item?.kind === 'risk' ? 'risk' : 'question',
        text,
        evidence_ids: normalizeEvidenceIds(item?.evidence_ids || item?.evidence)
      }
    })
    .filter(Boolean)
    .slice(0, 8)

  const topicChapters = asArray(payload.topic_chapters)
    .map((item, index) => {
      const title = normalizeText(item?.title)
      const summary = normalizeText(item?.summary || item?.text)
      if (!title && !summary) return null
      const startMs = Number.isFinite(Number(item?.start_ms)) ? Math.max(0, Math.round(Number(item.start_ms))) : null
      const endMs = Number.isFinite(Number(item?.end_ms)) ? Math.max(startMs || 0, Math.round(Number(item.end_ms))) : null
      return {
        id: `topic-${index + 1}`,
        title: title || `Topic ${index + 1}`,
        summary: summary || null,
        start_ms: startMs,
        end_ms: endMs,
        evidence_ids: normalizeEvidenceIds(item?.evidence_ids || item?.evidence)
      }
    })
    .filter(Boolean)
    .slice(0, 8)

  return {
    language: normalizeText(payload.language) || null,
    mini_summary: normalizeText(payload.mini_summary || payload.summary) || null,
    summary_points: summaryPoints,
    decisions,
    open_items: openItems,
    topic_chapters: topicChapters
  }
}

function buildPrompt(context) {
  return JSON.stringify({
    instructions: {
      output_rules: [
        'Return valid JSON only.',
        `Write the summary in ${context.targetLanguage}.`,
        'Use only the evidence ids present in transcript.segments and chat.messages.',
        'Do not invent decisions, risks, or citations.',
        'Keep the mini_summary to one short paragraph.',
        'Keep summary_points concise and business-focused.'
      ],
      shape: {
        language: 'string',
        mini_summary: 'string',
        summary_points: ['string'],
        decisions: [{ text: 'string', evidence_ids: ['string'] }],
        open_items: [{ kind: 'question|risk', text: 'string', evidence_ids: ['string'] }],
        topic_chapters: [{ title: 'string', summary: 'string', start_ms: 'number|null', end_ms: 'number|null', evidence_ids: ['string'] }]
      }
    },
    context: buildSummaryPromptInput(context)
  }, null, 2)
}

function buildReadySummaryPayload(context, draft) {
  const decisions = draft.decisions.map((item) => ({
    id: item.id,
    text: item.text,
    evidence: materializeEvidenceByIds(item.evidence_ids, context.evidenceCatalog)
  }))

  const openItems = draft.open_items.map((item) => ({
    id: item.id,
    kind: item.kind,
    text: item.text,
    evidence: materializeEvidenceByIds(item.evidence_ids, context.evidenceCatalog)
  }))

  const topicChapters = draft.topic_chapters.map((item) => {
    const evidence = materializeEvidenceByIds(item.evidence_ids, context.evidenceCatalog)
    const transcriptEvidence = evidence.filter((entry) => entry.type === 'transcript')
    const inferredStartMs = transcriptEvidence.length > 0
      ? Math.min(...transcriptEvidence.map((entry) => entry.start_ms))
      : null
    const inferredEndMs = transcriptEvidence.length > 0
      ? Math.max(...transcriptEvidence.map((entry) => entry.end_ms))
      : null

    return {
      id: item.id,
      title: item.title,
      summary: item.summary,
      start_ms: item.start_ms ?? inferredStartMs,
      end_ms: item.end_ms ?? inferredEndMs,
      evidence
    }
  })

  const payload = {
    language: context.targetLanguage || draft.language || context.transcriptArtifact?.payload?.language || null,
    mini_summary: draft.mini_summary || draft.summary_points[0] || null,
    summary_points: draft.summary_points,
    decisions,
    open_items: openItems,
    topic_chapters: topicChapters,
    coverage: context.coverage,
    markdown: ''
  }

  payload.markdown = buildMeetingSummaryMarkdown(payload)
  return payload
}

async function loadSummaryCandidates(db) {
  const artifacts = await db('meeting_artifacts')
    .where('artifact_type', 'summary')
    .orderBy('updated_at', 'asc')
    .select('*')

  return artifacts
    .filter((artifact) => artifact.status === 'pending' || artifact.status === 'processing')
    .slice(0, SUMMARY_POLL_LIMIT)
}

function shouldWaitForTranscript(transcriptArtifact) {
  if (!transcriptArtifact) return false
  if (transcriptArtifact.status === 'ready' || transcriptArtifact.status === 'failed') return false

  return transcriptArtifact.status === 'pending' || transcriptArtifact.status === 'processing'
}

async function updateSummaryArtifact(app, artifact, meeting, patch) {
  const db = app.get('postgresqlClient')
  const nowIso = new Date().toISOString()

  await db('meeting_artifacts')
    .where('id', artifact.id)
    .update({
      ...patch,
      updated_at: nowIso
    })

  const upsertArtifactSearchDocument = app.get('upsertMeetingArtifactSearchDocument') || upsertMeetingArtifactSearchDocument
  await upsertArtifactSearchDocument(db, artifact.id)

  app.service('meetings').emit('artifacts-updated', {
    meetingId: meeting.id,
    chatChannelId: meeting.chat_channel_id,
    artifactTypes: ['summary']
  })
}

export async function processPendingMeetingSummaries(app) {
  const db = app.get('postgresqlClient')
  const candidates = await loadSummaryCandidates(db)
  if (candidates.length === 0) {
    return 0
  }

  const runtime = await getActiveMeetingSummaryRuntime(db, app)
    || await getManualMeetingSummaryRuntime(db, app)
  if (!runtime) {
    return 0
  }

  let processed = 0
  const generateObject = app.get('generateStructuredObject') || generateStructuredObject

  for (const artifact of candidates) {
    if (SUMMARY_ARTIFACTS_IN_FLIGHT.has(artifact.id)) continue
    SUMMARY_ARTIFACTS_IN_FLIGHT.add(artifact.id)

    try {
      const meeting = await db('meetings').where('id', artifact.meeting_id).first()
      if (!meeting || meeting.status !== 'ended') {
        continue
      }

      const context = await loadMeetingAiContext(db, meeting)
      if (shouldWaitForTranscript(context.transcriptArtifact)) {
        continue
      }

      if (!hasMeetingAiInput(context)) {
        await updateSummaryArtifact(app, artifact, meeting, {
          status: 'failed',
          payload: {
            coverage: context.coverage,
            markdown: '',
            failure_message: 'No meeting transcript or chat content was available for summarization'
          }
        })
        processed += 1
        continue
      }

      const draft = await generateObject({
        providerType: runtime.providerInstance.provider_type,
        apiKey: runtime.apiKey,
        baseUrl: runtime.providerInstance.base_url,
        model: runtime.functionConfig.model,
        systemPrompt: 'You create grounded business meeting summaries for Nebulynk. Only use provided meeting evidence and always return valid JSON.',
        userPrompt: buildPrompt(context),
        capability: 'meeting_summary',
        validateObject: normalizeSummaryDraft
      })

      const payload = buildReadySummaryPayload(context, draft)

      if (!payload.mini_summary && payload.summary_points.length === 0 && payload.markdown.length === 0) {
        await updateSummaryArtifact(app, artifact, meeting, {
          status: 'failed',
          payload: {
            coverage: context.coverage,
            markdown: '',
            failure_message: 'Meeting summary model returned an empty response'
          }
        })
        processed += 1
        continue
      }

      await updateSummaryArtifact(app, artifact, meeting, {
        status: 'ready',
        payload
      })
      processed += 1
    } catch (error) {
      const meeting = await db('meetings').where('id', artifact.meeting_id).first()
      if (meeting) {
        const context = await loadMeetingAiContext(db, meeting)
        await updateSummaryArtifact(app, artifact, meeting, {
          status: 'failed',
          payload: {
            coverage: context.coverage,
            markdown: '',
            failure_message: error.message
          }
        })
      }
      processed += 1
    } finally {
      SUMMARY_ARTIFACTS_IN_FLIGHT.delete(artifact.id)
    }
  }

  return processed
}
