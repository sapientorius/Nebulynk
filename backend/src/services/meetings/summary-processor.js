import { normalizeSummaryDraft, buildReadySummaryPayload } from '../../lib/meeting-summary-draft.js'
import { normalizeChangeSummary, notifySummaryUpdated, summaryVersion } from '../../lib/meeting-summary-revisions.js'
import { generateStructuredObject } from '../../lib/ai-provider-adapters.js'
import {
  buildSummaryPromptInput,
  hasMeetingAiInput,
  loadMeetingAiContext
} from '../../lib/meeting-ai.js'
import {
  getActiveMeetingSummaryRuntime,
  getManualMeetingSummaryRuntime
} from '../../lib/meeting-recordings.js'

const SUMMARY_POLL_LIMIT = 10
const SUMMARY_ARTIFACTS_IN_FLIGHT = new Set()

function buildPrompt(context, regeneration) {
  return JSON.stringify({
    instructions: {
      output_rules: [
        'Return valid JSON only.',
        `Write the summary in ${context.targetLanguage}.`,
        'Use only the evidence ids present in transcript.segments and chat.messages.',
        'Do not invent decisions, risks, or citations.',
        'Keep the mini_summary to one short paragraph.',
        'Keep summary_points concise and business-focused.',
        ...(regeneration ? ['Also return change_summary: 1-3 short sentences describing actual changes compared with previous_summary. Write it in the summary language.'] : [])
      ],
      shape: {
        language: 'string',
        mini_summary: 'string',
        summary_points: ['string'],
        decisions: [{ text: 'string', evidence_ids: ['string'] }],
        open_items: [{ kind: 'question|risk', text: 'string', evidence_ids: ['string'] }],
        topic_chapters: [{ title: 'string', summary: 'string', start_ms: 'number|null', end_ms: 'number|null', evidence_ids: ['string'] }],
        ...(regeneration ? { change_summary: 'string' } : {})
      }
    },
    context: buildSummaryPromptInput(context),
    ...(regeneration ? { previous_summary: regeneration.before_payload } : {})
  }, null, 2)
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

async function updateSummaryArtifact(app, artifact, meeting, patch, regeneration = null, changeSummary = null) {
  const db = app.get('postgresqlClient')
  const nowIso = new Date().toISOString()

  const committed = await db.transaction(async trx => {
    const current = await trx('meeting_artifacts').where('id', artifact.id).forUpdate().first()
    if (!current || summaryVersion(current) !== summaryVersion(artifact)
      || !['pending', 'processing'].includes(current.status)) return false
    const failed = patch.status === 'failed'
    const next = failed && regeneration
      ? { status: 'ready', payload: regeneration.before_payload }
      : patch
    await trx('meeting_artifacts').where('id', artifact.id).update({
      ...next, summary_version: summaryVersion(current) + 1, updated_at: nowIso
    })
    if (regeneration) await trx('meeting_summary_revisions').where('id', regeneration.id).update({
      status: failed ? 'failed' : 'applied', payload: failed ? null : patch.payload,
      change_summary: !failed && regeneration.publish_change ? changeSummary : null,
      publish_change: !failed && regeneration.publish_change, applied_at: failed ? null : nowIso
    })
    return true
  })
  if (committed) await notifySummaryUpdated(app, meeting, artifact.id)
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
    let regeneration = null

    try {
      const meeting = await db('meetings').where('id', artifact.meeting_id).first()
      if (!meeting || meeting.status !== 'ended') {
        continue
      }

      const context = await loadMeetingAiContext(db, meeting)
      regeneration = await db('meeting_summary_revisions').where({ meeting_id: meeting.id, kind: 'regenerate', status: 'generating', base_version: summaryVersion(artifact) - 1 }).first()
      if (regeneration?.before_payload?.language) context.targetLanguage = regeneration.before_payload.language
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
        }, regeneration)
        processed += 1
        continue
      }

      const draft = await generateObject({
        providerType: runtime.providerInstance.provider_type,
        apiKey: runtime.apiKey,
        baseUrl: runtime.providerInstance.base_url,
        model: runtime.functionConfig.model,
        ...runtime.requestOptions,
        systemPrompt: 'You create grounded business meeting summaries for Nebulynk. Only use provided meeting evidence and always return valid JSON.',
        userPrompt: buildPrompt(context, regeneration),
        capability: 'meeting_summary',
        validateObject: value => ({ ...normalizeSummaryDraft(value), ...(regeneration ? { change_summary: normalizeChangeSummary(value.change_summary) } : {}) })
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
        }, regeneration)
        processed += 1
        continue
      }

      await updateSummaryArtifact(app, artifact, meeting, {
        status: 'ready',
        payload
      }, regeneration, regeneration ? normalizeChangeSummary(draft.change_summary) : null)
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
        }, regeneration)
      }
      processed += 1
    } finally {
      SUMMARY_ARTIFACTS_IN_FLIGHT.delete(artifact.id)
    }
  }

  return processed
}
