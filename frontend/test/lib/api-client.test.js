import { describe, expect, it, vi } from 'vitest'
import { createApiClient, resolveSocketBaseUrl } from '../../src/lib/api-client.js'

function attachAdapter(client, calls) {
  client.http.defaults.adapter = vi.fn(async (config) => {
    calls.push(config)
    return {
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config
    }
  })
}

describe('createApiClient', () => {
  it('keeps auth and base URLs isolated between clients', async () => {
    const firstCalls = []
    const secondCalls = []
    const firstClient = createApiClient({
      baseUrl: 'https://alpha.example.test',
      persistCsrfToStorage: false,
      initialAuthState: {
        accessToken: 'token-alpha'
      }
    })
    const secondClient = createApiClient({
      baseUrl: 'https://beta.example.test',
      persistCsrfToStorage: false,
      initialAuthState: {
        accessToken: 'token-beta'
      }
    })

    attachAdapter(firstClient, firstCalls)
    attachAdapter(secondClient, secondCalls)

    await firstClient.http.get('/channels')
    await secondClient.http.get('/notifications')

    expect(firstCalls[0].baseURL).toBe('https://alpha.example.test')
    expect(firstCalls[0].headers.Authorization).toBe('Bearer token-alpha')
    expect(secondCalls[0].baseURL).toBe('https://beta.example.test')
    expect(secondCalls[0].headers.Authorization).toBe('Bearer token-beta')
  })

  it('persists auth snapshots through the provided callback', async () => {
    const persisted = []
    const client = createApiClient({
      baseUrl: 'https://alpha.example.test',
      persistCsrfToStorage: false,
      onPersistAuthState: (snapshot) => {
        persisted.push(snapshot)
      }
    })

    client.storeAuthenticationResult({
      accessToken: 'token-123',
      csrfToken: 'csrf-123',
      user: {
        id: 'user-1',
        display_name: 'Ada'
      }
    })

    expect(persisted.at(-1)).toMatchObject({
      accessToken: 'token-123',
      csrfToken: 'csrf-123',
      user: {
        id: 'user-1',
        display_name: 'Ada'
      }
    })
  })
})

describe('resolveSocketBaseUrl', () => {
  it('maps relative browser dev api paths to the backend dev port', () => {
    expect(resolveSocketBaseUrl('/api', {
      targetWindow: {
        location: {
          origin: 'http://localhost:5173'
        }
      }
    })).toBe('http://localhost:3030')

    expect(resolveSocketBaseUrl('/api', {
      targetWindow: {
        location: {
          origin: 'http://127.0.0.1:4173'
        }
      }
    })).toBe('http://127.0.0.1:3030')
  })

  it('keeps absolute api bases on their backend origin', () => {
    expect(resolveSocketBaseUrl('https://chat.example.com/api')).toBe('https://chat.example.com')
  })

  it('prefers an explicit backend origin when the api base stays relative', () => {
    expect(resolveSocketBaseUrl('/api', {
      backendBaseUrl: 'https://backend.example.com/api',
      targetWindow: {
        location: {
          origin: 'http://localhost:5173'
        }
      }
    })).toBe('https://backend.example.com')
  })
})

