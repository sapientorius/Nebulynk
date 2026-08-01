function normalizeString(value) {
  if (typeof value !== 'string') return null
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > 0 ? collapsed : null
}

function truncateText(value, limit = 280) {
  const normalized = normalizeString(value)
  if (!normalized) return null
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 3)).trimEnd()}...`
}

function toTimestampMs(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export const MAX_PROMPT_TRANSCRIPT_SEGMENTS = 320
export const MAX_PROMPT_CHAT_MESSAGES = 240
export const MAX_PROMPT_TRANSCRIPT_EXCERPT_CHARS = 24000

function parsePositiveIntegerEnv(value, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback

  const normalized = Math.floor(numeric)
  return normalized > 0 ? normalized : fallback
}

export function getMeetingAiPromptLimits(env = process.env) {
  return {
    maxTranscriptSegments: parsePositiveIntegerEnv(
      env.MEETING_AI_PROMPT_TRANSCRIPT_SEGMENTS,
      MAX_PROMPT_TRANSCRIPT_SEGMENTS
    ),
    maxChatMessages: parsePositiveIntegerEnv(
      env.MEETING_AI_PROMPT_CHAT_MESSAGES,
      MAX_PROMPT_CHAT_MESSAGES
    ),
    maxTranscriptExcerptChars: parsePositiveIntegerEnv(
      env.MEETING_AI_PROMPT_TRANSCRIPT_EXCERPT_CHARS,
      MAX_PROMPT_TRANSCRIPT_EXCERPT_CHARS
    )
  }
}

function sortByCreatedAt(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at || 0)
    const rightTime = Date.parse(right?.created_at || 0)
    if (leftTime !== rightTime) return leftTime - rightTime
    return String(left?.id || '').localeCompare(String(right?.id || ''))
  })
}

function normalizeTranscriptSegment(segment, index) {
  const text = normalizeString(segment?.text)
  const startMs = toTimestampMs(segment?.start_ms)
  const endMs = toTimestampMs(segment?.end_ms)

  if (!text || startMs === null || endMs === null) {
    return null
  }

  return {
    id: `transcript:${index + 1}`,
    type: 'transcript',
    snippet: truncateText(text, 220),
    text,
    speaker_label: normalizeString(segment?.speaker_label) || 'Unknown speaker',
    start_ms: startMs,
    end_ms: Math.max(startMs, endMs)
  }
}

function normalizeChatMessage(message, usersById) {
  const content = normalizeString(message?.content)
  if (!content) return null

  return {
    id: `chat:${message.id}`,
    type: 'chat',
    message_id: message.id,
    user_id: message.user_id || null,
    author_display_name: normalizeString(usersById.get(message.user_id)?.display_name)
      || normalizeString(message.user_display_name)
      || 'Unknown author',
    created_at: message.created_at || null,
    snippet: truncateText(content, 220),
    text: content
  }
}

export function normalizeText(value) {
  return normalizeString(value)
}

export function buildMeetingCoverage({ transcriptArtifact, chatMessages }) {
  const transcriptPayload = transcriptArtifact?.payload && typeof transcriptArtifact.payload === 'object'
    ? transcriptArtifact.payload
    : {}
  const basis = []

  if (normalizeString(transcriptPayload.text) || asArray(transcriptPayload.segments).length > 0) {
    basis.push('transcript')
  }
  if ((chatMessages || []).length > 0) {
    basis.push('chat')
  }

  return {
    basis,
    transcript_status: transcriptArtifact?.status || 'missing',
    transcript_completeness: normalizeString(transcriptPayload.completeness) || null,
    transcript_warning_count: asArray(transcriptPayload.warnings).length,
    chat_message_count: (chatMessages || []).length,
    chat_author_count: new Set((chatMessages || []).map((entry) => entry.user_id).filter(Boolean)).size
  }
}

export function buildMeetingSummaryMarkdown(payload = {}) {
  const lines = []
  const miniSummary = normalizeString(payload.mini_summary)
  const summaryPoints = asArray(payload.summary_points).map((item) => normalizeString(item)).filter(Boolean)
  const decisions = asArray(payload.decisions).filter((item) => normalizeString(item?.text))
  const openItems = asArray(payload.open_items).filter((item) => normalizeString(item?.text))
  const topicChapters = asArray(payload.topic_chapters).filter((item) => (
    normalizeString(item?.title) || normalizeString(item?.summary)
  ))

  if (miniSummary) {
    lines.push('## Summary', '', miniSummary)
  }

  if (summaryPoints.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('## Highlights', '', ...summaryPoints.map((item) => `- ${item}`))
  }

  if (decisions.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('## Decisions', '', ...decisions.map((item) => `- ${item.text.trim()}`))
  }

  if (openItems.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('## Open Questions / Risks', '', ...openItems.map((item) => `- ${item.text.trim()}`))
  }

  if (topicChapters.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('## Topics', '')
    for (const chapter of topicChapters) {
      const title = normalizeString(chapter.title) || 'Topic'
      const summary = normalizeString(chapter.summary)
      lines.push(`### ${title}`)
      if (summary) {
        lines.push('', summary, '')
      } else {
        lines.push('')
      }
    }
    while (lines[lines.length - 1] === '') {
      lines.pop()
    }
  }

  return lines.join('\n').trim()
}

export async function loadMeetingAiContext(db, meeting) {
  const transcriptArtifact = await db('meeting_artifacts')
    .where({
      meeting_id: meeting.id,
      artifact_type: 'transcript'
    })
    .first()

  const summaryArtifact = await db('meeting_artifacts')
    .where({
      meeting_id: meeting.id,
      artifact_type: 'summary'
    })
    .first()

  const sourceChannel = meeting.source_channel_id
    ? await db('channels').where('id', meeting.source_channel_id).first()
    : null

  let rawMessages = await db('messages')
    .where('channel_id', meeting.chat_channel_id)
    .whereNull('deleted_at')
    .orderBy('created_at', 'asc')
    .select('*')

  rawMessages = sortByCreatedAt(rawMessages)
    .filter((message) => message?.type !== 'system')

  const userIds = [...new Set(rawMessages.map((message) => message.user_id).filter(Boolean))]
  let users = []
  if (userIds.length > 0) {
    users = await db('users').whereIn('id', userIds).select('id', 'display_name')
  }
  const usersById = new Map(users.map((user) => [user.id, user]))

  const chatMessages = rawMessages
    .map((message) => normalizeChatMessage(message, usersById))
    .filter(Boolean)

  const transcriptPayload = transcriptArtifact?.payload && typeof transcriptArtifact.payload === 'object'
    ? transcriptArtifact.payload
    : {}
  const transcriptSegments = asArray(transcriptPayload.segments)
    .map((segment, index) => normalizeTranscriptSegment(segment, index))
    .filter(Boolean)
  const transcriptText = normalizeString(transcriptPayload.text)
    || transcriptSegments
      .map((segment) => `${segment.speaker_label}: ${segment.text}`)
      .join('\n')
  const promptLimits = getMeetingAiPromptLimits()
  const promptTranscriptSegments = transcriptSegments
    .slice(0, promptLimits.maxTranscriptSegments)
    .map((segment) => ({
      id: segment.id,
      type: segment.type,
      speaker_label: segment.speaker_label,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      text: segment.text
    }))
  const promptChatMessages = chatMessages
    .slice(0, promptLimits.maxChatMessages)
    .map((message) => ({
      id: message.id,
      type: message.type,
      author_display_name: message.author_display_name,
      created_at: message.created_at,
      text: message.text
    }))

  const evidenceCatalog = new Map()
  for (const segment of transcriptSegments) {
    evidenceCatalog.set(segment.id, {
      type: 'transcript',
      snippet: segment.snippet,
      speaker_label: segment.speaker_label,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms
    })
  }
  for (const message of chatMessages) {
    evidenceCatalog.set(message.id, {
      type: 'chat',
      snippet: message.snippet,
      message_id: message.message_id,
      author_display_name: message.author_display_name,
      created_at: message.created_at
    })
  }

  return {
    meeting,
    targetLanguage: normalizeString(meeting.language) || null,
    sourceChannel,
    transcriptArtifact,
    summaryArtifact,
    transcriptSegments,
    transcriptText: transcriptText || null,
    promptTranscriptSegments,
    chatMessages,
    promptChatMessages,
    evidenceCatalog,
    coverage: buildMeetingCoverage({ transcriptArtifact, chatMessages })
  }
}

export function hasMeetingAiInput(context) {
  return Boolean(normalizeString(context?.transcriptText))
    || asArray(context?.transcriptSegments).length > 0
    || asArray(context?.chatMessages).length > 0
}

export function materializeEvidenceByIds(evidenceIds, evidenceCatalog, { limit = 4 } = {}) {
  const uniqueIds = [...new Set(asArray(evidenceIds).map((value) => normalizeString(value)).filter(Boolean))]
  const items = []

  for (const evidenceId of uniqueIds) {
    const item = evidenceCatalog.get(evidenceId)
    if (!item) continue
    items.push(item)
    if (items.length >= limit) break
  }

  return items
}

export function buildSummaryPromptInput(context) {
  return {
    meeting: {
      id: context.meeting.id,
      title: normalizeString(context.meeting.title) || null,
      target_language: normalizeString(context.targetLanguage) || null,
      source_channel_name: normalizeString(context.sourceChannel?.name) || null,
      started_at: context.meeting.started_at || null,
      ended_at: context.meeting.ended_at || null
    },
    transcript: {
      status: context.transcriptArtifact?.status || 'missing',
      completeness: normalizeString(context.transcriptArtifact?.payload?.completeness) || null,
      text_excerpt: truncateText(
        context.transcriptText,
        getMeetingAiPromptLimits().maxTranscriptExcerptChars
      ),
      segments: context.promptTranscriptSegments
    },
    chat: {
      messages: context.promptChatMessages
    }
  }
}

export function buildQuestionPromptInput(context, question) {
  return {
    question,
    meeting: {
      id: context.meeting.id,
      title: normalizeString(context.meeting.title) || null,
      source_channel_name: normalizeString(context.sourceChannel?.name) || null,
      started_at: context.meeting.started_at || null,
      ended_at: context.meeting.ended_at || null
    },
    summary: context.summaryArtifact?.status === 'ready' && context.summaryArtifact.payload
      ? {
          mini_summary: normalizeString(context.summaryArtifact.payload.mini_summary) || null,
          summary_points: asArray(context.summaryArtifact.payload.summary_points).map((item) => normalizeString(item)).filter(Boolean),
          decisions: asArray(context.summaryArtifact.payload.decisions).map((item) => normalizeString(item?.text)).filter(Boolean),
          open_items: asArray(context.summaryArtifact.payload.open_items).map((item) => normalizeString(item?.text)).filter(Boolean)
        }
      : null,
    transcript: {
      status: context.transcriptArtifact?.status || 'missing',
      text_excerpt: truncateText(
        context.transcriptText,
        getMeetingAiPromptLimits().maxTranscriptExcerptChars
      ),
      segments: context.promptTranscriptSegments
    },
    chat: {
      messages: context.promptChatMessages
    }
  }
}
