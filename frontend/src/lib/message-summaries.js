export const DEFAULT_MESSAGE_SUMMARY_MIN_CHARS = 400

export function getMessageSummaryMinChars() {
  const configured = Number(import.meta.env.VITE_MESSAGE_SUMMARY_MIN_CHARS)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_MESSAGE_SUMMARY_MIN_CHARS
  return Math.round(configured)
}

export function normalizeMessageText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function parseTimelineTimestamp(value) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getLoadedMessageWindow(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return null
  const oldest = messages[0]?.created_at || null
  const newest = messages[messages.length - 1]?.created_at || null
  const oldestTime = parseTimelineTimestamp(oldest)
  const newestTime = parseTimelineTimestamp(newest)
  if (!oldestTime || !newestTime) return null
  return { oldestTime, newestTime }
}

function normalizeWindowTimestamp(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseSummaryDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function formatSummaryDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date)
}

function formatSummaryTime(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatSummaryDateTime(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function isMessageSummarizable(message, { minChars = getMessageSummaryMinChars() } = {}) {
  if (!message || message.deleted_at || message.type === 'system') return false
  const content = normalizeMessageText(message.content)
  return content.length >= minChars
}

export function isMessageSelectableForSummary(message) {
  if (!message || message.deleted_at || message.type === 'system') return false
  return normalizeMessageText(message.content).length > 0
}

export function getSummaryTimelineAnchor(summary) {
  return summary?.source_ended_at
    || summary?.source_started_at
    || summary?.created_at
    || summary?.updated_at
    || null
}

export function getSummaryDisplayRange(summary) {
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

export function buildMessageTimelineWindow(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return null
  const startAt = normalizeWindowTimestamp(messages[0]?.created_at)
  const endAt = normalizeWindowTimestamp(messages[messages.length - 1]?.created_at)
  if (!startAt || !endAt) return null
  return { startAt, endAt }
}

export function summaryOverlapsWindow(summary, window) {
  if (!window?.startAt || !window?.endAt) return true
  const { startAt, endAt } = getSummaryDisplayRange(summary)
  const summaryStartTime = parseTimelineTimestamp(startAt)
  const summaryEndTime = parseTimelineTimestamp(endAt)
  const windowStartTime = parseTimelineTimestamp(window.startAt)
  const windowEndTime = parseTimelineTimestamp(window.endAt)

  if (!summaryStartTime || !summaryEndTime || !windowStartTime || !windowEndTime) return true
  return summaryEndTime >= windowStartTime && summaryStartTime <= windowEndTime
}

export function compareSummariesByTimeline(left, right) {
  const leftTime = parseTimelineTimestamp(getSummaryTimelineAnchor(left))
  const rightTime = parseTimelineTimestamp(getSummaryTimelineAnchor(right))
  if (leftTime !== rightTime) return leftTime - rightTime

  const leftCreatedTime = parseTimelineTimestamp(left?.created_at || left?.updated_at)
  const rightCreatedTime = parseTimelineTimestamp(right?.created_at || right?.updated_at)
  if (leftCreatedTime !== rightCreatedTime) return leftCreatedTime - rightCreatedTime

  return String(left?.id || '').localeCompare(String(right?.id || ''))
}

export function formatSummaryTimeLabel(summary, { locale } = {}) {
  const { startAt, endAt } = getSummaryDisplayRange(summary)
  const startDate = parseSummaryDate(startAt)
  const endDate = parseSummaryDate(endAt)

  if (startDate && endDate) {
    if (startDate.getTime() === endDate.getTime()) {
      return formatSummaryDateTime(endDate, locale)
    }

    if (isSameCalendarDay(startDate, endDate)) {
      return `${formatSummaryDate(startDate, locale)}, ${formatSummaryTime(startDate, locale)}-${formatSummaryTime(endDate, locale)}`
    }

    return `${formatSummaryDateTime(startDate, locale)} - ${formatSummaryDateTime(endDate, locale)}`
  }

  if (endDate) return formatSummaryDateTime(endDate, locale)
  if (startDate) return formatSummaryDateTime(startDate, locale)
  return ''
}

export function mergeMessagesAndSummaries(messages = [], summaries = []) {
  const items = []
  const loadedWindow = getLoadedMessageWindow(messages)
  for (const [index, message] of (messages || []).entries()) {
    items.push({
      kind: 'message',
      id: `message:${message.id}`,
      message,
      messageIndex: index,
      created_at: message.created_at || null
    })
  }
  for (const summary of summaries || []) {
    const { startAt, endAt } = getSummaryDisplayRange(summary)
    const rangeStartTime = parseTimelineTimestamp(startAt)
    const rangeEndTime = parseTimelineTimestamp(endAt)
    const anchorTime = parseTimelineTimestamp(getSummaryTimelineAnchor(summary))

    if (loadedWindow) {
      const candidateStartTime = rangeStartTime || anchorTime
      const candidateEndTime = rangeEndTime || anchorTime
      if (candidateStartTime && candidateEndTime) {
        const isOutsideLoadedWindow = candidateEndTime < loadedWindow.oldestTime || candidateStartTime > loadedWindow.newestTime
        if (isOutsideLoadedWindow) continue
      }
    }

    items.push({
      kind: 'summary',
      id: `summary:${summary.id}`,
      summary,
      timeline_at: getSummaryTimelineAnchor(summary),
      created_at: summary.created_at || summary.updated_at || null
    })
  }

  return items.sort((left, right) => {
    const leftTime = parseTimelineTimestamp(left.timeline_at || left.created_at)
    const rightTime = parseTimelineTimestamp(right.timeline_at || right.created_at)
    if (leftTime !== rightTime) return leftTime - rightTime
    if (left.kind !== right.kind) return left.kind === 'message' ? -1 : 1
    return left.id.localeCompare(right.id)
  })
}
