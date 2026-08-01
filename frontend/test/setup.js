import { beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

function createStorageMock() {
  const storage = new Map()

  return {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, String(value))
    },
    removeItem(key) {
      storage.delete(key)
    },
    clear() {
      storage.clear()
    }
  }
}

const localStorageMock = createStorageMock()
const sessionStorageMock = createStorageMock()

if (!globalThis.localStorage) {
  globalThis.localStorage = localStorageMock
}

if (!globalThis.sessionStorage) {
  globalThis.sessionStorage = sessionStorageMock
}

if (!globalThis.window) {
  globalThis.window = {}
}

if (!globalThis.window.location) {
  globalThis.window.location = { pathname: '/' }
}

if (!globalThis.AudioContext) {
  globalThis.AudioContext = class AudioContext {}
}

beforeEach(() => {
  globalThis.localStorage?.clear()
  globalThis.sessionStorage?.clear()
  setActivePinia(createPinia())
  if (!globalThis.window) {
    globalThis.window = {}
  }
  if (!globalThis.window.location) {
    globalThis.window.location = { pathname: '/' }
  }
  globalThis.window.location.pathname = '/'
  globalThis.window.$message = {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
})
