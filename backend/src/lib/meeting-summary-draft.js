import { buildMeetingSummaryMarkdown, materializeEvidenceByIds, normalizeText } from './meeting-ai.js'

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

export function normalizeSummaryDraft(payload, { maxItems = 8 } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Meeting summary draft must be an object')
  }

  const summaryPoints = asArray(payload.summary_points)
    .map((item) => normalizeText(typeof item === 'string' ? item : item?.text))
    .filter(Boolean)
    .slice(0, maxItems)

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
    .slice(0, maxItems)

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
    .slice(0, maxItems)

  const topicChapters = asArray(payload.topic_chapters)
    .map((item, index) => {
      const title = normalizeText(item?.title)
      const summary = normalizeText(item?.summary || item?.text)
      if (!title && !summary) return null
      const startMs = item?.start_ms != null && Number.isFinite(Number(item.start_ms)) ? Math.max(0, Math.round(Number(item.start_ms))) : null
      const endMs = item?.end_ms != null && Number.isFinite(Number(item.end_ms)) ? Math.max(startMs || 0, Math.round(Number(item.end_ms))) : null
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
    .slice(0, maxItems)

  return {
    language: normalizeText(payload.language) || null,
    mini_summary: normalizeText(payload.mini_summary || payload.summary) || null,
    summary_points: summaryPoints,
    decisions,
    open_items: openItems,
    topic_chapters: topicChapters
  }
}

export function buildReadySummaryPayload(context, draft) {
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

