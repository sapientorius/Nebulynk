import { isAppForegroundVisible } from './desktop-window-state.js'

export const FOREGROUND_RESUME_SYNC_DEBOUNCE_MS = 150

export function startForegroundResumeSync({
  onSync = async () => {},
  targetWindow = typeof window !== 'undefined' ? window : null,
  targetDocument = typeof document !== 'undefined' ? document : null,
  debounceMs = FOREGROUND_RESUME_SYNC_DEBOUNCE_MS
} = {}) {
  if (!targetWindow || !targetDocument) {
    return {
      requestSync() {
        return null
      },
      stop() {}
    }
  }

  let timerId = null
  let inFlightSync = null
  let stopped = false
  let pendingVisibleChatSync = false
  let windowHasFocus = typeof targetDocument.hasFocus === 'function'
    ? targetDocument.hasFocus()
    : true

  function isVisible() {
    return isAppForegroundVisible({
      targetDocument,
      hasWindowFocus: windowHasFocus
    })
  }

  function clearTimer() {
    if (!timerId) return
    clearTimeout(timerId)
    timerId = null
  }

  function requestSync(reason = 'manual', { immediate = false, requireVisibleChat = false } = {}) {
    if (stopped) return null
    pendingVisibleChatSync = pendingVisibleChatSync || requireVisibleChat

    if (timerId || inFlightSync) {
      return inFlightSync
    }

    if (immediate) {
      return runSync(reason)
    }

    timerId = setTimeout(() => {
      timerId = null
      runSync(reason)
    }, debounceMs)

    return null
  }

  function runSync(reason) {
    if (stopped) return null
    clearTimer()

    if (inFlightSync) {
      return inFlightSync
    }

    const currentlyVisible = isVisible()
    const includeVisibleChat = currentlyVisible && pendingVisibleChatSync
    if (includeVisibleChat) {
      pendingVisibleChatSync = false
    }

    inFlightSync = Promise.resolve(onSync({
      reason,
      isVisible: currentlyVisible,
      includeVisibleChat
    }))
      .finally(() => {
        inFlightSync = null
        if (!stopped && pendingVisibleChatSync && isVisible()) {
          requestSync('foreground-visible-catchup', {
            immediate: true,
            requireVisibleChat: true
          })
        }
      })

    return inFlightSync
  }

  function handleVisibilityChange() {
    if (targetDocument.visibilityState !== 'visible') return
    if (!isVisible()) return
    requestSync('visibilitychange', { requireVisibleChat: true })
  }

  function handleWindowFocus() {
    windowHasFocus = true
    if (!isVisible()) return
    requestSync('focus', { requireVisibleChat: true })
  }

  function handleWindowBlur() {
    windowHasFocus = false
  }

  function handleDesktopWindowState() {
    if (!isVisible()) return
    requestSync('desktop-window-state', { requireVisibleChat: true })
  }

  targetDocument.addEventListener('visibilitychange', handleVisibilityChange)
  targetWindow.addEventListener('focus', handleWindowFocus)
  targetWindow.addEventListener('blur', handleWindowBlur)
  targetWindow.addEventListener('nebulynk:desktop-window-state', handleDesktopWindowState)

  return {
    requestSync,
    stop() {
      stopped = true
      clearTimer()
      targetDocument.removeEventListener('visibilitychange', handleVisibilityChange)
      targetWindow.removeEventListener('focus', handleWindowFocus)
      targetWindow.removeEventListener('blur', handleWindowBlur)
      targetWindow.removeEventListener('nebulynk:desktop-window-state', handleDesktopWindowState)
    }
  }
}
