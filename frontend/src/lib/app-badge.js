function normalizeUnreadCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return 0
  return Math.max(0, Math.trunc(count))
}

export async function syncAppBadge(unreadCount) {
  if (typeof navigator === 'undefined') return false

  const count = normalizeUnreadCount(unreadCount)
  const updateBadge = count > 0
    ? typeof navigator.setAppBadge === 'function'
      ? () => navigator.setAppBadge(count)
      : null
    : typeof navigator.clearAppBadge === 'function'
      ? () => navigator.clearAppBadge()
      : null

  if (!updateBadge) return false

  try {
    await updateBadge()
    return true
  } catch {
    return false
  }
}
