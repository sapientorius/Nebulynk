import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadDesktopStateMock = vi.hoisted(() => vi.fn(async () => ({
  activeProfileId: null,
  profiles: []
})))
const saveDesktopStateMock = vi.hoisted(() => vi.fn(async () => {}))
const listenDesktopMock = vi.hoisted(() => vi.fn(async () => () => {}))
const runtimeState = vi.hoisted(() => ({
  isDesktopRuntime: true,
  isLocalDesktopAppOrigin: true
}))

vi.mock('../../src/lib/desktop-bridge.js', () => ({
  loadDesktopState: loadDesktopStateMock,
  saveDesktopState: saveDesktopStateMock,
  listenDesktop: listenDesktopMock
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopRuntime: () => runtimeState.isDesktopRuntime,
  isLocalDesktopAppOrigin: () => runtimeState.isLocalDesktopAppOrigin
}))

vi.mock('../../src/lib/api.js', () => ({
  setActiveApiClientContext: vi.fn(() => null)
}))

vi.mock('../../src/lib/socket.js', () => ({
  setActiveSocketClientContext: vi.fn(() => null)
}))

describe('desktop runtime initialization', () => {
  beforeEach(() => {
    vi.resetModules()
    loadDesktopStateMock.mockClear()
    saveDesktopStateMock.mockClear()
    listenDesktopMock.mockClear()
    runtimeState.isDesktopRuntime = true
    runtimeState.isLocalDesktopAppOrigin = true
  })

  it('loads local desktop state for local Tauri app windows', async () => {
    const runtimeModule = await import('../../src/lib/desktop-runtime.js')

    await runtimeModule.initializeDesktopRuntime()

    expect(loadDesktopStateMock).toHaveBeenCalledTimes(1)
    expect(runtimeModule.desktopState.ready).toBe(true)
  })

  it('skips local desktop state loading for remote desktop workspace windows', async () => {
    runtimeState.isLocalDesktopAppOrigin = false
    const runtimeModule = await import('../../src/lib/desktop-runtime.js')

    await runtimeModule.initializeDesktopRuntime()

    expect(loadDesktopStateMock).not.toHaveBeenCalled()
    expect(runtimeModule.desktopState.ready).toBe(true)
  })
})
