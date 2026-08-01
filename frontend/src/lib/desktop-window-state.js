import { reactive } from 'vue'
import { isAnyDesktopRuntime } from './runtime.js'

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function isDocumentHidden(targetDocument) {
  if (!targetDocument) return false
  return targetDocument.visibilityState === 'hidden'
}

export const desktopWindowState = reactive({
  isDesktop: isAnyDesktopRuntime(),
  isVisible: true,
  isFocused: true,
  isHidden: false,
  isMinimized: false,
  isOccluded: false,
  lastChangedAt: null
})

export function updateDesktopWindowState(patch = {}) {
  desktopWindowState.isDesktop = isAnyDesktopRuntime()
  desktopWindowState.isVisible = normalizeBoolean(patch.isVisible, desktopWindowState.isVisible)
  desktopWindowState.isFocused = normalizeBoolean(patch.isFocused, desktopWindowState.isFocused)
  desktopWindowState.isHidden = normalizeBoolean(patch.isHidden, desktopWindowState.isHidden)
  desktopWindowState.isMinimized = normalizeBoolean(patch.isMinimized, desktopWindowState.isMinimized)
  desktopWindowState.isOccluded = normalizeBoolean(patch.isOccluded, desktopWindowState.isOccluded)
  desktopWindowState.lastChangedAt = typeof patch.updatedAt === 'string'
    ? patch.updatedAt
    : new Date().toISOString()
}

export function resetDesktopWindowState() {
  desktopWindowState.isDesktop = isAnyDesktopRuntime()
  desktopWindowState.isVisible = true
  desktopWindowState.isFocused = true
  desktopWindowState.isHidden = false
  desktopWindowState.isMinimized = false
  desktopWindowState.isOccluded = false
  desktopWindowState.lastChangedAt = null
}

export function isDesktopWindowUserVisible() {
  if (!isAnyDesktopRuntime()) return false
  return desktopWindowState.isVisible
    && !desktopWindowState.isHidden
    && !desktopWindowState.isMinimized
    && !desktopWindowState.isOccluded
}

export function isDesktopWindowBackgrounded() {
  if (!isAnyDesktopRuntime()) return false
  return !isDesktopWindowUserVisible()
}

export function isAppBackgrounded(targetDocument = typeof document !== 'undefined' ? document : null) {
  if (isAnyDesktopRuntime()) {
    return isDesktopWindowBackgrounded() || isDocumentHidden(targetDocument)
  }

  return isDocumentHidden(targetDocument)
}

export function isAppForegroundVisible({
  targetDocument = typeof document !== 'undefined' ? document : null,
  hasWindowFocus = true
} = {}) {
  if (isAnyDesktopRuntime()) {
    return isDesktopWindowUserVisible()
      && !isDocumentHidden(targetDocument)
  }

  return targetDocument?.visibilityState === 'visible' && hasWindowFocus
}
