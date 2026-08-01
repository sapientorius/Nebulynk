import { isAppForegroundVisible } from './desktop-window-state.js'

function canUseBrowserApis(targetWindow, targetDocument) {
  return Boolean(targetWindow && targetDocument)
}

export const ACTIVITY_HEARTBEAT_THROTTLE_MS = 30_000

export function resolveForegroundChannelId(route) {
  const routeName = route?.name
  const routeChannelId = route?.params?.channelId
  const normalizedChannelId = typeof routeChannelId === 'string' && routeChannelId.trim()
    ? routeChannelId.trim()
    : null

  if (!normalizedChannelId) return null
  if (routeName === 'App' || routeName === 'ChannelScreenShare') {
    return normalizedChannelId
  }

  return null
}

export function startForegroundChannelTracking({
  socket,
  router,
  subscribeToAuthenticated = () => () => {},
  targetWindow = typeof window !== 'undefined' ? window : null,
  targetDocument = typeof document !== 'undefined' ? document : null,
  now = () => new Date().toISOString()
} = {}) {
  if (!socket?.emit || !router || !canUseBrowserApis(targetWindow, targetDocument)) {
    return () => {}
  }

  let lastSentKey = null
  let lastActivityHeartbeatAt = 0
  let windowHasFocus = typeof targetDocument.hasFocus === 'function' ? targetDocument.hasFocus() : true

  function isAppVisible() {
    return isAppForegroundVisible({
      targetDocument,
      hasWindowFocus: windowHasFocus
    })
  }

  function buildPayload({ includeActivity = false } = {}) {
    const isVisible = isAppVisible()
    const timestamp = now()
    const payload = {
      activeChannelId: isVisible ? resolveForegroundChannelId(router.currentRoute.value) : null,
      isVisible,
      updatedAt: timestamp
    }

    if (includeActivity && isVisible) {
      payload.lastActivityAt = timestamp
    }

    return payload
  }

  function sendState({ force = false, includeActivity = false } = {}) {
    if (!socket.__nebulynkAuthReady) return

    const payload = buildPayload({ includeActivity })
    const nextKey = JSON.stringify({
      activeChannelId: payload.activeChannelId,
      isVisible: payload.isVisible
    })

    if (!force && !includeActivity && nextKey === lastSentKey) return
    lastSentKey = nextKey
    if (payload.lastActivityAt) {
      lastActivityHeartbeatAt = Date.parse(payload.lastActivityAt) || Date.now()
    }

    socket.emit('patch', 'presence', 'foreground', payload, {}, () => {})
  }

  function handleVisibilityChange() {
    sendState({ includeActivity: isAppVisible() })
  }

  function handleWindowFocus() {
    windowHasFocus = true
    sendState({ includeActivity: true })
  }

  function handleWindowBlur() {
    windowHasFocus = false
    sendState()
  }

  function handleActivity() {
    if (!isAppVisible()) return

    const nowMs = Date.parse(now()) || Date.now()
    if (lastActivityHeartbeatAt && nowMs - lastActivityHeartbeatAt < ACTIVITY_HEARTBEAT_THROTTLE_MS) {
      return
    }

    sendState({ includeActivity: true })
  }

  function handleDesktopWindowState() {
    sendState({ includeActivity: isAppVisible() })
  }

  const removeRouteHook = router.afterEach(() => {
    sendState({ includeActivity: isAppVisible() })
  })

  targetDocument.addEventListener('visibilitychange', handleVisibilityChange)
  targetWindow.addEventListener('focus', handleWindowFocus)
  targetWindow.addEventListener('blur', handleWindowBlur)
  targetWindow.addEventListener('pagehide', handleWindowBlur)
  targetWindow.addEventListener('pointermove', handleActivity)
  targetWindow.addEventListener('pointerdown', handleActivity)
  targetWindow.addEventListener('keydown', handleActivity)
  targetWindow.addEventListener('scroll', handleActivity)
  targetWindow.addEventListener('touchstart', handleActivity)
  targetWindow.addEventListener('nebulynk:desktop-window-state', handleDesktopWindowState)

  const unsubscribeFromAuthenticated = subscribeToAuthenticated((authenticatedSocket) => {
    if (authenticatedSocket !== socket) return
    sendState({ force: true, includeActivity: isAppVisible() })
  })

  sendState({ force: true, includeActivity: isAppVisible() })

  return () => {
    removeRouteHook?.()
    unsubscribeFromAuthenticated?.()
    targetDocument.removeEventListener('visibilitychange', handleVisibilityChange)
    targetWindow.removeEventListener('focus', handleWindowFocus)
    targetWindow.removeEventListener('blur', handleWindowBlur)
    targetWindow.removeEventListener('pagehide', handleWindowBlur)
    targetWindow.removeEventListener('pointermove', handleActivity)
    targetWindow.removeEventListener('pointerdown', handleActivity)
    targetWindow.removeEventListener('keydown', handleActivity)
    targetWindow.removeEventListener('scroll', handleActivity)
    targetWindow.removeEventListener('touchstart', handleActivity)
    targetWindow.removeEventListener('nebulynk:desktop-window-state', handleDesktopWindowState)
  }
}
