function canUseWindow(targetWindow = typeof window !== 'undefined' ? window : null) {
  return Boolean(targetWindow)
}

function hasElectronDesktopApi(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!canUseWindow(targetWindow)) return false
  const desktopApi = targetWindow.nebulynkDesktop
  return !!desktopApi && typeof desktopApi.listen === 'function'
}

function getElectronDesktopApi(targetWindow = typeof window !== 'undefined' ? window : null) {
  return hasElectronDesktopApi(targetWindow) ? targetWindow.nebulynkDesktop : null
}

function readDesktopWindowParam(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!canUseWindow(targetWindow)) return ''
  try {
    const currentUrl = new URL(targetWindow.location.href)
    return currentUrl.searchParams.get('desktopWindow') || ''
  } catch {
    return ''
  }
}

export function isDesktopRuntime(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!canUseWindow(targetWindow)) return false
  return !!targetWindow.__TAURI_INTERNALS__ || hasElectronDesktopApi(targetWindow)
}

export function isAnyDesktopRuntime(targetWindow = typeof window !== 'undefined' ? window : null) {
  return isDesktopRuntime(targetWindow)
}

export function getDesktopRuntimeKind(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!canUseWindow(targetWindow)) return null
  if (!!targetWindow.__TAURI_INTERNALS__) return 'tauri'
  if (hasElectronDesktopApi(targetWindow)) return 'electron'
  return null
}

export function isDesktopDiagnosticsEnabled(targetWindow = typeof window !== 'undefined' ? window : null) {
  return getElectronDesktopApi(targetWindow)?.diagnosticsEnabled === true
}

export function isElectronDesktopRuntime(targetWindow = typeof window !== 'undefined' ? window : null) {
  return getDesktopRuntimeKind(targetWindow) === 'electron'
}

export function isLocalDesktopAppOrigin(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!isDesktopRuntime(targetWindow)) return false

  try {
    const currentUrl = new URL(targetWindow.location.href)
    if (currentUrl.protocol === 'app:') return true
    if (currentUrl.protocol === 'tauri:') return true
    if (currentUrl.hostname === 'tauri.localhost') return true
    if (
      (currentUrl.hostname === 'localhost' || currentUrl.hostname === '127.0.0.1')
      && (currentUrl.port === '1420' || currentUrl.port === '1421')
    ) {
      return true
    }
  } catch {
    return false
  }

  return false
}

export function isDesktopManagerWindow(targetWindow = typeof window !== 'undefined' ? window : null) {
  return isLocalDesktopAppOrigin(targetWindow) && readDesktopWindowParam(targetWindow) === 'server-manager'
}

export function isDesktopWorkspaceWindow(targetWindow = typeof window !== 'undefined' ? window : null) {
  return isDesktopRuntime(targetWindow) && !isDesktopManagerWindow(targetWindow)
}

export function isRemoteDesktopWorkspaceWindow(targetWindow = typeof window !== 'undefined' ? window : null) {
  return isDesktopWorkspaceWindow(targetWindow) && !isLocalDesktopAppOrigin(targetWindow)
}

export function shouldUseDesktopWorkspaceBridge(targetWindow = typeof window !== 'undefined' ? window : null) {
  if (!isDesktopWorkspaceWindow(targetWindow)) return false
  if (!isLocalDesktopAppOrigin(targetWindow)) return true
  return getDesktopRuntimeKind(targetWindow) === 'electron'
}

export function canUseBrowserNotifications() {
  return !isDesktopRuntime() && typeof Notification !== 'undefined'
}

