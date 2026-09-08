import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../../src/lib/api-client.js'
import { setActiveApiClient, getSmtpSettings, updateSmtpSettings, testSmtpConnection, sendSmtpTestEmail } from '../../src/lib/api.js'

const clients = []
function client(options = {}) {
  const instance = createApiClient({
    persistCsrfToStorage: false,
    redirectOnAuthFailure: false,
    logAuthSessionDiagnostics: false,
    defaultSessionTransport: 'body',
    initialAuthState: { accessToken: 'old', refreshToken: 'refresh', sessionTransport: 'body' },
    ...options
  })
  clients.push(instance)
  return instance
}
function response(config, data = {}) {
  return { config, data, status: 200, statusText: 'OK', headers: {} }
}
function unauthorized(config) {
  return Object.assign(new Error('Unauthorized'), { config, response: { status: 401 } })
}
afterEach(() => {
  clients.splice(0).forEach(instance => instance.destroy())
  vi.useRealTimers()
})

describe('API client composition contracts', () => {
  it('routes all SMTP facade calls through the selected client with unchanged payloads', async () => {
    const first = client({ baseUrl: 'https://smtp-first.invalid' })
    const second = client({ baseUrl: 'https://smtp-second.invalid' })
    const requests = []
    for (const instance of [first, second]) instance.http.defaults.adapter = async config => {
      requests.push([config.baseURL, config.method, config.url, config.data && JSON.parse(config.data)])
      return response(config, { ok: true })
    }
    setActiveApiClient(first)
    expect(await getSmtpSettings()).toEqual({ ok: true })
    setActiveApiClient(second)
    await updateSmtpSettings({ host: 'mail.invalid' })
    await testSmtpConnection()
    await sendSmtpTestEmail({ to: 'test@example.invalid' })
    expect(requests).toEqual([
      ['https://smtp-first.invalid', 'get', '/smtp-settings', undefined],
      ['https://smtp-second.invalid', 'patch', '/smtp-settings', { host: 'mail.invalid' }],
      ['https://smtp-second.invalid', 'post', '/smtp-settings', { action: 'test_connection' }],
      ['https://smtp-second.invalid', 'post', '/smtp-settings', { action: 'send_test_email', to: 'test@example.invalid' }]
    ])
  })
  it('coalesces parallel refreshes within each client without sharing tokens', async () => {
    const first = client()
    const second = client()
    let release
    const pending = new Promise(resolve => { release = resolve })
    const firstAdapter = vi.fn(async config => { await pending; return response(config, { accessToken: 'alpha', refreshToken: 'next-alpha' }) })
    const secondAdapter = vi.fn(async config => response(config, { accessToken: 'beta', refreshToken: 'next-beta' }))
    first.http.defaults.adapter = firstAdapter
    second.http.defaults.adapter = secondAdapter
    const firstRequests = [first.restoreBrowserSession({ forceRefresh: true }), first.restoreBrowserSession({ forceRefresh: true })]
    await second.restoreBrowserSession({ forceRefresh: true })
    release()
    await Promise.all(firstRequests)
    expect(firstAdapter).toHaveBeenCalledTimes(1)
    expect(secondAdapter).toHaveBeenCalledTimes(1)
    expect(first.getStoredAccessToken()).toBe('alpha')
    expect(second.getStoredAccessToken()).toBe('beta')
  })

  it('retries unauthorized requests once and respects both opt-out flags', async () => {
    const instance = client()
    const requests = []
    instance.http.defaults.adapter = async config => {
      requests.push(config.url)
      if (config.url === '/auth/session/refresh') return response(config, { accessToken: 'new' })
      throw unauthorized(config)
    }
    await expect(instance.http.get('/channels')).rejects.toThrow('Unauthorized')
    expect(requests).toEqual(['/channels', '/auth/session/refresh', '/channels'])
    for (const flag of ['__skipAuthRefresh', '__authRetryAttempted']) {
      instance.storeAuthenticationResult({ accessToken: 'another' })
      requests.length = 0
      await expect(instance.http.get('/channels', { [flag]: true })).rejects.toThrow('Unauthorized')
      expect(requests).toEqual(['/channels'])
    }
  })

  it('clears local authentication even when logout fails', async () => {
    const instance = client()
    instance.http.defaults.adapter = async () => { throw new Error('offline') }
    await instance.logout()
    expect(instance.getStoredAccessToken()).toBeNull()
    expect(instance.getCurrentUser()).toBeNull()
  })

  it('uses the current base URL and shares platform cache only for the same normalized URL', async () => {
    let baseUrl = 'https://ap04-cache-a.invalid/'
    const first = client({ getBaseUrl: () => baseUrl })
    const same = client({ baseUrl: 'https://ap04-cache-a.invalid' })
    const other = client({ baseUrl: 'https://ap04-cache-b.invalid' })
    const adapter = vi.fn(async config => response(config, { source: config.baseURL }))
    for (const instance of [first, same, other]) instance.http.defaults.adapter = adapter
    expect(await first.getPlatformStatus()).toEqual({ source: 'https://ap04-cache-a.invalid' })
    expect(await same.getPlatformStatus()).toEqual({ source: 'https://ap04-cache-a.invalid' })
    expect(adapter).toHaveBeenCalledTimes(1)
    await other.getPlatformStatus()
    baseUrl = 'https://ap04-cache-c.invalid/'
    expect(await first.getPlatformStatus()).toEqual({ source: 'https://ap04-cache-c.invalid' })
    expect(adapter).toHaveBeenCalledTimes(3)
  })

  it('destroy releases refresh timers and listeners without affecting another client', () => {
    vi.useFakeTimers()
    const first = client()
    const second = client()
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    first.subscribeToAuthState(firstListener)
    second.subscribeToAuthState(secondListener)
    const accessToken = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.signature`
    first.storeAuthenticationResult({ accessToken })
    second.storeAuthenticationResult({ accessToken })
    expect(vi.getTimerCount()).toBe(2)
    first.destroy()
    firstListener.mockClear()
    first.storeAuthenticationResult({ accessToken: 'later' })
    expect(firstListener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)
    second.storeAuthenticationResult({ accessToken: 'updated' })
    expect(secondListener).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'updated' }))
  })
})
