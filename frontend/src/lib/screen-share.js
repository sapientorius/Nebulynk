export function pickFeaturedScreenShare(shares = [], pinnedParticipantId = null) {
  if (!Array.isArray(shares) || shares.length === 0) return null
  if (pinnedParticipantId) {
    const pinned = shares.find((entry) => entry?.participantId === pinnedParticipantId)
    if (pinned) return pinned
  }

  const local = shares.find((entry) => entry?.isLocal)
  return local || shares[0] || null
}

export function isScreenShareOwnedByParticipant(share, participantId) {
  if (!share || !participantId) return false
  return share.participantId === participantId
}

export function buildScreenShareWindowPath({ type, id } = {}) {
  if (!id) return null
  if (type === 'meeting') return `/meetings/${id}/screen-share`
  if (type === 'channel') return `/channels/${id}/screen-share`
  return null
}

export function openDetachedScreenShareWindow({ router, uiStore, type, id } = {}) {
  const path = buildScreenShareWindowPath({ type, id })
  if (!path || !router) return null

  const route = router.resolve(path)
  const popup = window.open(route.href, 'nebulynk-screen-share', 'popup=yes,width=1400,height=900,resizable=yes')
  uiStore?.markScreenShareWindowOpen?.(!!popup)
  popup?.focus?.()
  return popup || null
}
