import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const listenDesktopMock = vi.hoisted(() => vi.fn(async () => () => {}))
const runtimeState = vi.hoisted(() => ({
  isDesktopRuntime: true,
  isElectronDesktopRuntime: true,
  isDesktopDiagnosticsEnabled: false
}))

vi.mock('@tauri-apps/api/core', () => ({
  addPluginListener: vi.fn(),
  invoke: invokeMock
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopRuntime: () => runtimeState.isDesktopRuntime,
  isElectronDesktopRuntime: () => runtimeState.isElectronDesktopRuntime,
  isDesktopDiagnosticsEnabled: () => runtimeState.isDesktopDiagnosticsEnabled
}))

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  listenDesktop: listenDesktopMock
}))

describe('desktop notification plugin', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeMock.mockReset()
    listenDesktopMock.mockReset()
    listenDesktopMock.mockResolvedValue(() => {})
    runtimeState.isDesktopRuntime = true
    runtimeState.isElectronDesktopRuntime = true
    runtimeState.isDesktopDiagnosticsEnabled = false
    global.window.nebulynkDesktop = {
      getNotificationPermission: vi.fn(async () => 'granted'),
      requestNotificationPermission: vi.fn(async () => 'granted'),
      showNotification: vi.fn(async () => true),
      listen: vi.fn(async () => () => {})
    }
  })

  it('uses the Electron preload API for desktop notification permission and show calls', async () => {
    const notificationPluginModule = await import('../../src/lib/desktop-notification-plugin.js')

    await expect(notificationPluginModule.getDesktopNotificationPermission()).resolves.toBe('granted')
    await expect(notificationPluginModule.requestDesktopNotificationPermission()).resolves.toBe('granted')
    await expect(notificationPluginModule.showDesktopNativeNotification({
      title: 'Admin',
      body: 'Ping',
      serverId: 'profile-1',
      route: '/channels/channel-1'
    })).resolves.toBe(true)

    expect(global.window.nebulynkDesktop.getNotificationPermission).toHaveBeenCalledTimes(1)
    expect(global.window.nebulynkDesktop.requestNotificationPermission).toHaveBeenCalledTimes(1)
    expect(global.window.nebulynkDesktop.showNotification).toHaveBeenCalledTimes(1)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('falls back to Tauri invoke for non-Electron desktop runtimes', async () => {
    runtimeState.isElectronDesktopRuntime = false
    invokeMock.mockResolvedValue('granted')
    const notificationPluginModule = await import('../../src/lib/desktop-notification-plugin.js')

    await expect(notificationPluginModule.getDesktopNotificationPermission()).resolves.toBe('granted')

    expect(invokeMock).toHaveBeenCalledWith('desktop_get_notification_permission', {})
  })
})
