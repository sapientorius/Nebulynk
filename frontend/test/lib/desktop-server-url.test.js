import { describe, expect, it } from 'vitest'
import { resolveDesktopApiBaseUrl, resolveDesktopAppUrl } from '../../src/lib/desktop-server-url.js'

describe('resolveDesktopApiBaseUrl', () => {
  it('maps a local frontend dev origin to the backend dev origin', () => {
    expect(resolveDesktopApiBaseUrl('http://localhost:5173')).toBe('http://localhost:3030')
    expect(resolveDesktopApiBaseUrl('http://127.0.0.1:1420')).toBe('http://127.0.0.1:3030')
  })

  it('preserves explicit backend and api urls', () => {
    expect(resolveDesktopApiBaseUrl('http://localhost:3030')).toBe('http://localhost:3030')
    expect(resolveDesktopApiBaseUrl('https://chat.example.com/api')).toBe('https://chat.example.com/api')
  })

  it('derives the api path from a deployed server origin', () => {
    expect(resolveDesktopApiBaseUrl('https://chat.example.com')).toBe('https://chat.example.com/api')
    expect(resolveDesktopApiBaseUrl('https://chat.example.com/nebulynk')).toBe('https://chat.example.com/nebulynk/api')
  })
})

describe('resolveDesktopAppUrl', () => {
  it('keeps app routes under a deployed base path', () => {
    expect(resolveDesktopAppUrl('https://chat.example.com/nebulynk', '/channels/channel-1'))
      .toBe('https://chat.example.com/nebulynk/channels/channel-1')
  })

  it('preserves the root origin for flat deployments', () => {
    expect(resolveDesktopAppUrl('https://chat.example.com', '/login'))
      .toBe('https://chat.example.com/login')
  })
})
