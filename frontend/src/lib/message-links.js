export function buildMessagePath(channelId, messageId) {
  if (!channelId || !messageId) return null
  return `/channels/${encodeURIComponent(channelId)}?message=${encodeURIComponent(messageId)}`
}

export function buildMessageUrl(origin, channelId, messageId) {
  const path = buildMessagePath(channelId, messageId)
  if (!path) return null
  if (!origin) return path
  return `${String(origin).replace(/\/$/, '')}${path}`
}

export function extractInternalMessageReference(rawValue) {
  if (typeof rawValue !== 'string') return null
  const value = rawValue.trim()
  if (!value) return null

  try {
    const url = new URL(value, 'http://nebulynk.local')
    const match = url.pathname.match(/^\/channels\/([^/]+)\/?$/)
    if (!match) return null

    const channelId = decodeURIComponent(match[1] || '').trim()
    const messageId = (url.searchParams.get('message') || '').trim()
    if (!channelId || !messageId) return null

    return {
      channelId,
      messageId
    }
  } catch {
    return null
  }
}
