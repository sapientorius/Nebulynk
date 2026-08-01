const MEETING_REFERENCE_PATTERN = /^\[Meeting\]\s+\/meetings\/([a-z0-9]+)$/

export function parseMeetingReferenceContent(content) {
  if (typeof content !== 'string') return null
  const match = content.match(MEETING_REFERENCE_PATTERN)
  return match ? match[1] : null
}

