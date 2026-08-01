const RECENT_EMOJIS_STORAGE_KEY = 'recentEmojis'
export const MAX_RECENT_EMOJIS = 8

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
}

function normalizeRecentEmojis(value) {
  if (!Array.isArray(value)) return []

  const seen = new Set()
  const normalized = []

  for (const entry of value) {
    if (typeof entry !== 'string' || !entry || seen.has(entry)) continue
    seen.add(entry)
    normalized.push(entry)
    if (normalized.length >= MAX_RECENT_EMOJIS) break
  }

  return normalized
}

export function loadRecentEmojis() {
  if (!canUseLocalStorage()) return []

  try {
    const raw = localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY)
    if (!raw) return []
    return normalizeRecentEmojis(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveRecentEmoji(emoji) {
  if (typeof emoji !== 'string' || !emoji) {
    return loadRecentEmojis()
  }

  const nextRecentEmojis = normalizeRecentEmojis([
    emoji,
    ...loadRecentEmojis().filter((entry) => entry !== emoji)
  ])

  if (canUseLocalStorage()) {
    localStorage.setItem(RECENT_EMOJIS_STORAGE_KEY, JSON.stringify(nextRecentEmojis))
  }

  return nextRecentEmojis
}
