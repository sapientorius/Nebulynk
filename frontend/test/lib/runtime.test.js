import { describe, expect, it } from 'vitest'
import {
  isDesktopDiagnosticsEnabled,
  isDesktopManagerWindow,
  isDesktopRuntime,
  isDesktopWorkspaceWindow,
  isLocalDesktopAppOrigin,
  isRemoteDesktopWorkspaceWindow,
  shouldUseDesktopWorkspaceBridge
} from '../../src/lib/runtime.js'

function createWindowLike(href, { tauri = true } = {}) {
  return {
    location: {
      href
    },
    __TAURI_INTERNALS__: tauri ? {} : null
  }
}

function createElectronWindowLike(href, { diagnosticsEnabled = false } = {}) {
  return {
    location: {
      href
    },
    nebulynkDesktop: {
      diagnosticsEnabled,
      listen() {}
    }
  }
}

describe('desktop runtime roles', () => {
  it('detects the local server-manager window from the desktopWindow query parameter', () => {
    const targetWindow = createWindowLike('https://tauri.localhost/index.html?desktopWindow=server-manager')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(true)
    expect(isDesktopManagerWindow(targetWindow)).toBe(true)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(false)
  })

  it('treats a remote Tauri-loaded server as a desktop workspace window', () => {
    const targetWindow = createWindowLike('https://chat.example.com/channels/channel-1')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(false)
    expect(isDesktopManagerWindow(targetWindow)).toBe(false)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(true)
    expect(isRemoteDesktopWorkspaceWindow(targetWindow)).toBe(true)
  })

  it('detects the local Electron manager window on the app protocol', () => {
    const targetWindow = createElectronWindowLike('app://desktop/index.html?desktopWindow=server-manager')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(true)
    expect(isDesktopManagerWindow(targetWindow)).toBe(true)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(false)
  })

  it('treats a remote Electron-loaded server as a desktop workspace window', () => {
    const targetWindow = createElectronWindowLike('https://chat.example.com/channels/channel-1')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(false)
    expect(isDesktopManagerWindow(targetWindow)).toBe(false)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(true)
    expect(isRemoteDesktopWorkspaceWindow(targetWindow)).toBe(true)
    expect(shouldUseDesktopWorkspaceBridge(targetWindow)).toBe(true)
  })

  it('starts the workspace bridge for local Electron workspace bootstrap windows', () => {
    const targetWindow = createElectronWindowLike('http://127.0.0.1:1421/')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(true)
    expect(isDesktopManagerWindow(targetWindow)).toBe(false)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(true)
    expect(isRemoteDesktopWorkspaceWindow(targetWindow)).toBe(false)
    expect(shouldUseDesktopWorkspaceBridge(targetWindow)).toBe(true)
  })

  it('reports desktop diagnostics only when the Electron preload enables them', () => {
    expect(isDesktopDiagnosticsEnabled(createElectronWindowLike('https://chat.example.com', {
      diagnosticsEnabled: true
    }))).toBe(true)
    expect(isDesktopDiagnosticsEnabled(createElectronWindowLike('https://chat.example.com'))).toBe(false)
  })

  it('keeps local Tauri workspace bootstrap windows on the manager-style path', () => {
    const targetWindow = createWindowLike('https://tauri.localhost/index.html')

    expect(isDesktopRuntime(targetWindow)).toBe(true)
    expect(isLocalDesktopAppOrigin(targetWindow)).toBe(true)
    expect(isDesktopManagerWindow(targetWindow)).toBe(false)
    expect(isDesktopWorkspaceWindow(targetWindow)).toBe(true)
    expect(isRemoteDesktopWorkspaceWindow(targetWindow)).toBe(false)
    expect(shouldUseDesktopWorkspaceBridge(targetWindow)).toBe(false)
  })
})
