import { describe, expect, it, vi } from 'vitest'

describe('PWA share target service worker', () => {
  it('stores share POSTs and redirects to the authenticated handoff route', async () => {
    vi.resetModules()
    const listeners = new Map()
    const workerScope = {
      importScripts: vi.fn(),
      addEventListener(type, handler) {
        listeners.set(type, handler)
      },
      location: {
        origin: 'https://chat.example.test'
      },
      skipWaiting: vi.fn(),
      clients: {
        claim: vi.fn()
      }
    }
    const storage = {
      storeFormData: vi.fn().mockResolvedValue({ id: 'share-1' })
    }
    workerScope.NebulynkShareTargetStorage = storage
    vi.stubGlobal('self', workerScope)

    await import('../../public/sw.js')

    const formData = { get: vi.fn(), getAll: vi.fn() }
    let responsePromise = null
    listeners.get('fetch')({
      request: {
        method: 'POST',
        url: 'https://chat.example.test/share-target',
        formData: vi.fn().mockResolvedValue(formData)
      },
      respondWith(value) {
        responsePromise = Promise.resolve(value)
      }
    })

    const response = await responsePromise
    expect(storage.storeFormData).toHaveBeenCalledWith(formData)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://chat.example.test/share/share-1')

    listeners.get('fetch')({
      request: {
        method: 'GET',
        url: 'https://chat.example.test/channels'
      },
      respondWith: vi.fn()
    })

    storage.storeFormData.mockRejectedValueOnce(new Error('quota exceeded'))
    let errorResponsePromise = null
    listeners.get('fetch')({
      request: {
        method: 'POST',
        url: 'https://chat.example.test/share-target',
        formData: vi.fn().mockResolvedValue(formData)
      },
      respondWith(value) {
        errorResponsePromise = Promise.resolve(value)
      }
    })

    const errorResponse = await errorResponsePromise
    expect(errorResponse.status).toBe(303)
    expect(errorResponse.headers.get('location')).toBe('https://chat.example.test/share?error=storage')
    vi.unstubAllGlobals()
  })
})
