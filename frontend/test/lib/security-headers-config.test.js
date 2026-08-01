import { describe, expect, it } from 'vitest'
import {
  buildFrontendContentSecurityPolicy,
  buildFrontendFrameAncestorsDirective,
  resolveFrontendConnectSourceOrigins
} from '../../security-headers.config.js'
import { renderNginxConfig } from '../../scripts/render-nginx-conf.mjs'

describe('frontend security headers config', () => {
  it('builds non-frameable frame ancestors directive', () => {
    expect(buildFrontendFrameAncestorsDirective()).toBe("frame-ancestors 'none'")
  })

  it('keeps preview csp aligned with the non-frameable self-hosted app policy', () => {
    const policy = buildFrontendContentSecurityPolicy({
      apiOrigin: 'https://api.example.com',
      livekitOrigin: 'wss://livekit.example.com'
    })
    const connectSrc = policy
      .split('; ')
      .find((directive) => directive.startsWith('connect-src '))
      .split(' ')
      .slice(1)

    expect(policy).toContain(buildFrontendFrameAncestorsDirective())
    expect(policy).toContain("connect-src 'self' https://api.example.com wss://api.example.com wss://livekit.example.com ws://127.0.0.1:47641")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy).toContain("worker-src 'self' blob:")
    expect(policy).not.toContain('cdn.jsdelivr.net')
    expect(policy).not.toContain('storage.googleapis.com')
    expect(connectSrc).not.toContain('https:')
    expect(connectSrc).not.toContain('ws:')
    expect(connectSrc).not.toContain('wss:')
  })

  it('normalizes configured API and LiveKit origins for connect-src', () => {
    expect(resolveFrontendConnectSourceOrigins({
      apiOrigins: ['https://api.example.com/api', 'not a url'],
      livekitOrigins: ['https://livekit.example.com/rtc']
    })).toEqual([
      "'self'",
      'https://api.example.com',
      'wss://api.example.com',
      'wss://livekit.example.com',
      'ws://127.0.0.1:47641'
    ])
  })

  it('renders nginx csp with wasm-only eval permission', () => {
    const nginxConfig = renderNginxConfig({
      VITE_API_URL: 'https://api.example.com/api',
      VITE_LIVEKIT_URL: 'wss://livekit.example.com'
    })

    expect(nginxConfig).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(nginxConfig).not.toContain("'unsafe-eval'")
    expect(nginxConfig).not.toContain('cdn.jsdelivr.net')
    expect(nginxConfig).not.toContain('storage.googleapis.com')
  })
})
