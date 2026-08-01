import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createWindowMock({ userAgent = 'Mozilla/5.0', standalone = false } = {}) {
  const listeners = new Map()
  const mediaQueryList = {
    matches: standalone,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }

  return {
    navigator: {
      standalone
    },
    matchMedia: vi.fn(() => mediaQueryList),
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || new Set()
      handlers.add(handler)
      listeners.set(type, handlers)
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler)
    },
    dispatchEvent(event) {
      const handlers = [...(listeners.get(event.type) || [])]
      for (const handler of handlers) {
        handler(event)
      }
      return true
    },
    __mediaQueryList: mediaQueryList,
    __userAgent: userAgent
  }
}

describe('pwa helper', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(async () => {
    const { __resetPwaStateForTests } = await import('../../src/lib/pwa.js')
    __resetPwaStateForTests()
    vi.unstubAllGlobals()
  })

  it('captures install prompt availability and clears it after prompting', async () => {
    const windowMock = createWindowMock()
    vi.stubGlobal('window', windowMock)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' })

    const pwa = await import('../../src/lib/pwa.js')
    const listener = vi.fn()
    const prompt = vi.fn().mockResolvedValue(undefined)

    pwa.subscribeToPwaInstallState(listener)

    let prevented = false
    windowMock.dispatchEvent({
      type: 'beforeinstallprompt',
      preventDefault() {
        prevented = true
      },
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' })
    })

    expect(prevented).toBe(true)
    expect(pwa.getPwaInstallState()).toMatchObject({
      hasInstallPrompt: true,
      canInstall: true,
      isInstalled: false
    })

    const result = await pwa.promptForAppInstall()

    expect(result).toEqual({ outcome: 'accepted' })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(pwa.getPwaInstallState().hasInstallPrompt).toBe(false)
    expect(listener).toHaveBeenCalled()
  })

  it('marks iOS devices without a prompt as manual-install capable', async () => {
    const windowMock = createWindowMock()
    vi.stubGlobal('window', windowMock)
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    })

    const { getPwaInstallState } = await import('../../src/lib/pwa.js')

    expect(getPwaInstallState()).toMatchObject({
      requiresManualInstall: true,
      canInstall: true,
      isInstallSupported: true
    })
  })

  it('reuses an existing service worker registration and keeps registration idempotent', async () => {
    const existingRegistration = { scope: '/' }
    const register = vi.fn()
    const getRegistration = vi.fn().mockResolvedValue(existingRegistration)
    vi.stubGlobal('window', createWindowMock())
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0',
      serviceWorker: {
        getRegistration,
        register,
        ready: Promise.resolve(existingRegistration)
      }
    })

    const { registerAppServiceWorker, waitForAppServiceWorkerReady } = await import('../../src/lib/pwa.js')

    const first = await registerAppServiceWorker()
    const second = await waitForAppServiceWorkerReady()

    expect(first).toBe(existingRegistration)
    expect(second).toBe(existingRegistration)
    expect(getRegistration).toHaveBeenCalledTimes(2)
    expect(register).not.toHaveBeenCalled()
  })
})
