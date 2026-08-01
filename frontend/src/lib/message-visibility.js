export function syncObservedMessageElements({ listEl, observer, observedMessageElements }) {
  if (!listEl || !observer) return observedMessageElements || {}

  const nextObserved = {}
  const elements = Array.from(listEl.querySelectorAll('[data-message-id]'))

  for (const element of elements) {
    const messageId = element.dataset?.messageId
    if (!messageId) continue
    nextObserved[messageId] = element
    if (observedMessageElements?.[messageId] !== element) {
      observer.observe(element)
    }
  }

  for (const [messageId, element] of Object.entries(observedMessageElements || {})) {
    if (nextObserved[messageId] !== element) {
      observer.unobserve(element)
    }
  }

  return nextObserved
}

function isMessageRowVisibleWithinList(listRect, elementRect) {
  if (!listRect || !elementRect) return false
  if (listRect.width <= 0 || listRect.height <= 0) return false
  if (elementRect.width <= 0 || elementRect.height <= 0) return false

  const verticallyVisible = elementRect.bottom > listRect.top && elementRect.top < listRect.bottom
  const horizontallyVisible = elementRect.right > listRect.left && elementRect.left < listRect.right

  return verticallyVisible && horizontallyVisible
}

export function collectVisibleViewportMessageIds({
  listEl,
  observedMessageElements,
  seenMessageIds,
  pendingMessageIds
}) {
  if (!listEl?.getBoundingClientRect) return []

  const listRect = listEl.getBoundingClientRect()
  const seen = seenMessageIds || {}
  const pending = pendingMessageIds || {}
  const visibleMessageIds = []

  for (const [messageId, element] of Object.entries(observedMessageElements || {})) {
    if (!messageId || seen[messageId] || pending[messageId]) continue
    if (!element?.getBoundingClientRect) continue

    const elementRect = element.getBoundingClientRect()
    if (!isMessageRowVisibleWithinList(listRect, elementRect)) continue

    visibleMessageIds.push(messageId)
  }

  return visibleMessageIds
}

export function handleMessageVisibilityEntries({
  entries,
  getSeenMessageIds,
  getPendingMessageIds,
  onVisibleMessageIds,
  onSeen,
  onPendingChange
}) {
  const seenMessageIds = getSeenMessageIds?.() || {}
  const pendingMessageIds = getPendingMessageIds?.() || {}
  const nextPending = { ...pendingMessageIds }
  const nextVisibleMessageIds = []

  for (const entry of entries) {
    if (!entry?.isIntersecting) continue

    const messageId = entry.target?.dataset?.messageId
    if (!messageId || seenMessageIds[messageId] || pendingMessageIds[messageId] || nextPending[messageId]) {
      continue
    }

    nextPending[messageId] = true
    nextVisibleMessageIds.push(messageId)
  }

  if (nextVisibleMessageIds.length === 0) {
    return
  }

  onPendingChange(nextPending)
  onVisibleMessageIds?.(nextVisibleMessageIds)
  onSeen?.(getSeenMessageIds?.() || {})
}
