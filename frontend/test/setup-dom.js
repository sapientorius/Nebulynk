import { afterEach, beforeEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

enableAutoUnmount(afterEach)
// zzfx constructs its device context at import time; no real audio device is used.
globalThis.AudioContext = class { close() {} }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  window.$message = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', vi.fn((query) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn()
  })))
  URL.createObjectURL = vi.fn(() => `blob:test-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.replaceChildren()
})
