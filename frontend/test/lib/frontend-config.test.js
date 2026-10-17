import { describe, expect, it } from 'vitest'
import { readFrontendConfig } from '../../src/lib/frontend-config.js'
import { resolveRuntimeConfig, serializeRuntimeConfig } from '../../scripts/frontend-runtime-config.mjs'
import { renderNginxConfig } from '../../scripts/render-nginx-conf.mjs'

describe('frontend runtime configuration', () => {
  it('prefers runtime values, including explicit empties, to Vite defaults', () => {
    const env = { VITE_API_URL: 'http://localhost:3030', VITE_VAPID_PUBLIC_KEY: 'baked' }
    expect(readFrontendConfig('apiUrl', { runtime: { apiUrl: ' https://api.example.com ' }, env })).toBe('https://api.example.com')
    expect(readFrontendConfig('vapidPublicKey', { runtime: { vapidPublicKey: '' }, env })).toBe('')
    expect(readFrontendConfig('apiUrl', { runtime: {}, env })).toBe('http://localhost:3030')
  })

  it('supports canonical variables, legacy aliases and the one-domain API path', () => {
    expect(resolveRuntimeConfig({ API_URL: '/api', VITE_API_URL: 'https://old.example.com', VITE_LIVEKIT_URL: 'https://calls.example.com' })).toEqual({
      apiUrl: '/api', backendUrl: '', livekitUrl: 'https://calls.example.com', vapidPublicKey: '', authCsrfCookieName: 'nebulynk_csrf_token'
    })
    expect(resolveRuntimeConfig({ VITE_API_URL: 'https://api.example.com', AUTH_CSRF_COOKIE_NAME: 'custom_csrf', VAPID_PUBLIC_KEY: '', VITE_VAPID_PUBLIC_KEY: 'old' }).vapidPublicKey).toBe('')
    expect(() => resolveRuntimeConfig({ API_URL: '', VITE_API_URL: '/api' })).toThrow('must be set')
    expect(resolveRuntimeConfig({ VITE_API_URL: '/api', VITE_BACKEND_URL: 'https://socket.example.com',
      VITE_LIVEKIT_URL: 'ws://calls.example.com', VITE_VAPID_PUBLIC_KEY: 'public-key', VITE_AUTH_CSRF_COOKIE_NAME: 'legacy_csrf'
    })).toEqual({ apiUrl: '/api', backendUrl: 'https://socket.example.com', livekitUrl: 'ws://calls.example.com',
      vapidPublicKey: 'public-key', authCsrfCookieName: 'legacy_csrf' })
  })

  it('rejects malformed URLs, credentials, unsafe origins and cookie names', () => {
    for (const value of ['//evil.example.com', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://$host/', 'http:example.com', '/api\\bad']) {
      expect(() => resolveRuntimeConfig({ API_URL: value })).toThrow()
    }
    expect(() => resolveRuntimeConfig({ API_URL: '/api', LIVEKIT_URL: 'wss://example.com/\nrtc' })).toThrow()
    expect(() => resolveRuntimeConfig({ API_URL: '/api', AUTH_CSRF_COOKIE_NAME: 'bad;cookie' })).toThrow()
  })

  it('serializes only public fields and escapes script-sensitive text', () => {
    const config = resolveRuntimeConfig({ API_URL: 'https://api.example.com', VAPID_PUBLIC_KEY: '</script>\u2028value', JWT_SECRET: 'private' })
    const source = serializeRuntimeConfig(config)
    expect(source).not.toContain('private')
    expect(source).not.toContain('</script>')
    expect(source).toContain('\\u2028')
    const target = {}
    new Function('window', source)(target)
    expect(target.__NEBULYNK_CONFIG__).toEqual(config)
  })

  it('generates a complete unprivileged Nginx config with matching CSP and cache rules', () => {
    const source = renderNginxConfig({ API_URL: 'https://api.example.com/api', BACKEND_URL: 'https://socket.example.com', LIVEKIT_URL: 'wss://calls.example.com' }, { runtime: true })
    expect(source).toContain('pid /tmp/nebulynk/nginx.pid;')
    expect(source).toContain('alias /tmp/nebulynk/runtime-config.js;')
    expect(source).toContain('wss://socket.example.com')
    expect(source).toContain('wss://calls.example.com')
    expect(source).toContain('https://calls.example.com')
    expect(source).toContain('Cache-Control "no-store"')
    expect(source).toContain('max-age=31536000, immutable')
    expect(source).not.toContain('user root')
    expect(source).not.toContain('/var/cache')
  })
})
