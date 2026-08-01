import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestInterceptorState = vi.hoisted(() => ({ fulfilled: null }))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: {
          use: vi.fn((fulfilled) => {
            requestInterceptorState.fulfilled = fulfilled
          })
        },
        response: {
          use: vi.fn()
        }
      }
    })
  }
}))

describe('api client FormData requests', () => {
  beforeEach(() => {
    vi.resetModules()
    requestInterceptorState.fulfilled = null
  })

  it('removes default json content type for multipart payloads', async () => {
    await import('../../src/lib/api.js')

    const formData = new FormData()
    formData.append('file', new Blob(['image'], { type: 'image/png' }), 'image.png')
    const config = requestInterceptorState.fulfilled({
      data: formData,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    expect(config.headers['Content-Type']).toBeUndefined()
    expect(config.withCredentials).toBe(true)
  })
})
