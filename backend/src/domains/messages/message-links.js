function parseUrlCandidate(rawValue) {
  if (typeof rawValue !== 'string') return null
  const value = rawValue.trim()
  if (!value) return null

  try {
    return new URL(value, 'http://nebulynk.local')
  } catch {
    return null
  }
}

export function extractInternalMessageReference(rawValue) {
  const url = parseUrlCandidate(rawValue)
  if (!url) return null

  const match = url.pathname.match(/^\/channels\/([^/]+)\/?$/)
  if (!match) return null

  const channelId = decodeURIComponent(match[1] || '').trim()
  const messageId = (url.searchParams.get('message') || '').trim()
  if (!channelId || !messageId) return null

  return {
    channelId,
    messageId
  }
}
