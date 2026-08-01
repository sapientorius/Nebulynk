import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeKindState = vi.hoisted(() => ({
  isDesktopRuntime: true,
  kind: 'electron'
}))

vi.mock('../../src/lib/runtime.js', () => ({
  isDesktopRuntime: () => runtimeKindState.isDesktopRuntime,
  getDesktopRuntimeKind: () => runtimeKindState.kind
}))

describe('desktop bridge electron adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    runtimeKindState.isDesktopRuntime = true
    runtimeKindState.kind = 'electron'
    global.window.nebulynkDesktop = {
      loadState: vi.fn(async () => ({ activeProfileId: null, profiles: [] })),
      listen: vi.fn((eventName, handler) => {
        global.window.__listener = { eventName, handler }
        return () => {
          delete global.window.__listener
        }
      })
    }
  })

  it('maps desktop commands to the Electron preload API', async () => {
    const bridgeModule = await import('../../src/lib/desktop-bridge.js')
    const state = await bridgeModule.invokeDesktop('desktop_load_state')

    expect(state).toEqual({
      activeProfileId: null,
      profiles: []
    })
    expect(global.window.nebulynkDesktop.loadState).toHaveBeenCalledTimes(1)
  })

  it('subscribes to desktop events through the Electron preload API', async () => {
    const bridgeModule = await import('../../src/lib/desktop-bridge.js')
    const handler = vi.fn()
    const unlisten = await bridgeModule.listenDesktop('desktop:state-changed', handler)

    expect(global.window.nebulynkDesktop.listen).toHaveBeenCalledWith('desktop:state-changed', handler)
    expect(typeof unlisten).toBe('function')
  })
})
