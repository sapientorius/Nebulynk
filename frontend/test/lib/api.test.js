import { beforeEach, describe, expect, it, vi } from 'vitest'

const DEFAULT_MEETING_VIDEO_PREFERENCES = {
 background_mode: 'none',
 preferred_camera_device_id: null,
 background_image_id: null,
 video_mirror: false
}

const apiCallMock = vi.hoisted(() => vi.fn())
const deleteMock = vi.hoisted(() => vi.fn())
const getMock = vi.hoisted(() => vi.fn())
const patchMock = vi.hoisted(() => vi.fn())
const postMock = vi.hoisted(() => vi.fn())
const requestInterceptorState = vi.hoisted(() => ({ fulfilled: null }))
const responseInterceptorState = vi.hoisted(() => ({ fulfilled: null, rejected: null }))

function createTestJwt(payload = {}) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

vi.mock('axios', () => ({
  default: {
    create: () => Object.assign(apiCallMock, {
      interceptors: {
        request: {
          use: vi.fn((fulfilled) => {
            requestInterceptorState.fulfilled = fulfilled
          })
        },
        response: {
          use: vi.fn((fulfilled, rejected) => {
            responseInterceptorState.fulfilled = fulfilled
            responseInterceptorState.rejected = rejected
          })
        }
      },
      delete: deleteMock,
      get: getMock,
      patch: patchMock,
      post: postMock
    })
  }
}))

describe('auth api helpers', () => {
  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    globalThis.document = {
      cookie: ''
    }
    apiCallMock.mockReset()
    deleteMock.mockReset()
    getMock.mockReset()
    patchMock.mockReset()
    postMock.mockReset()
    requestInterceptorState.fulfilled = null
    responseInterceptorState.fulfilled = null
    responseInterceptorState.rejected = null
  })

  it('deduplicates parallel platform status requests and reuses the cached payload', async () => {
    const { getPlatformStatus } = await import('../../src/lib/api.js')
    let resolvePlatformRequest

    getMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePlatformRequest = resolve
    }))

    const firstRequest = getPlatformStatus()
    const secondRequest = getPlatformStatus()

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith('/platform')

    resolvePlatformRequest({
      data: {
        initialized: 'true',
        default_locale: 'de'
      }
    })

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { initialized: 'true', default_locale: 'de' },
      { initialized: 'true', default_locale: 'de' }
    ])

    await expect(getPlatformStatus()).resolves.toEqual({
      initialized: 'true',
      default_locale: 'de'
    })
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('bypasses the platform status cache on refresh and updates the cached value after platform patches', async () => {
    const { getPlatformStatus, updatePlatformSettings } = await import('../../src/lib/api.js')

    getMock.mockResolvedValueOnce({
      data: {
        theme_mode_default: 'dark'
      }
    })
    patchMock.mockResolvedValueOnce({
      data: {
        theme_mode_default: 'light'
      }
    })
    getMock.mockResolvedValueOnce({
      data: {
        theme_mode_default: 'solarized'
      }
    })

    await expect(getPlatformStatus()).resolves.toEqual({
      theme_mode_default: 'dark'
    })
    await expect(updatePlatformSettings({ themeModeDefault: 'light' })).resolves.toEqual({
      theme_mode_default: 'light'
    })
    await expect(getPlatformStatus()).resolves.toEqual({
      theme_mode_default: 'light'
    })
    await expect(getPlatformStatus({ refresh: true })).resolves.toEqual({
      theme_mode_default: 'solarized'
    })

    expect(getMock).toHaveBeenCalledTimes(2)
    expect(patchMock).toHaveBeenCalledWith('/platform', {
      themeModeDefault: 'light'
    })
  })

  it('logs in through browser mode, bootstraps a cookie session, and keeps auth state in memory only', async () => {
    const { getCurrentUser, getStoredAccessToken, login } = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/login') {
        expect(payload).toEqual({
          email: 'alex@example.com',
          password: 'secret',
          remember: true
        })
        expect(config.__skipAuthRefresh).toBe(true)
        return {
          data: {
            accessToken: 'browser-token',
            user: { id: 'user-1', email: 'alex@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(payload).toEqual({
          transport: 'cookie',
          remember: true
        })
        expect(config.headers.Authorization).toBe('Bearer browser-token')
        return {
          data: {
            csrfToken: 'bootstrap-csrf-token',
            session: { id: 'session-1', transport: 'cookie' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    await login('alex@example.com', 'secret', { remember: true })

    expect(localStorage.getItem('accessToken')).toBe(null)
    expect(sessionStorage.getItem('accessToken')).toBe(null)
    expect(getStoredAccessToken()).toBe('browser-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-1',
      email: 'alex@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('logs in through desktop mode and bootstraps a body refresh session', async () => {
    const {
      getCurrentUser,
      getStoredAccessToken,
      login,
      restoreBrowserSession,
      setActiveApiClientContext
    } = await import('../../src/lib/api.js')

    setActiveApiClientContext({
      defaultSessionTransport: 'body',
      persistCsrfToStorage: false,
      createAuthSessionDebugId: () => 'auth-debug-body'
    })

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/login') {
        expect(payload).toEqual({
          email: 'desktop@example.com',
          password: 'secret',
          remember: true
        })
        return {
          data: {
            accessToken: 'desktop-token',
            user: { id: 'desktop-user', email: 'desktop@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(payload).toEqual({
          transport: 'body',
          remember: true
        })
        expect(config.headers.Authorization).toBe('Bearer desktop-token')
        return {
          data: {
            refreshToken: 'desktop-refresh-token',
            session: { id: 'session-desktop', transport: 'body' }
          }
        }
      }

      if (url === '/auth/session/refresh') {
        expect(payload).toEqual({
          refreshToken: 'desktop-refresh-token'
        })
        expect(config.headers['X-Auth-Session-Debug-Id']).toBe('auth-debug-body')
        return {
          data: {
            accessToken: 'desktop-refreshed-token',
            refreshToken: 'desktop-refresh-token-2',
            user: { id: 'desktop-user', email: 'desktop@example.com' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    await login('desktop@example.com', 'secret', { remember: true })

    expect(getStoredAccessToken()).toBe('desktop-token')
    expect(getCurrentUser()).toEqual({
      id: 'desktop-user',
      email: 'desktop@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })

    const restored = await restoreBrowserSession({ forceRefresh: true })

    expect(restored).toEqual({
      accessToken: 'desktop-refreshed-token',
      user: {
        id: 'desktop-user',
        email: 'desktop@example.com'
      },
      refreshToken: 'desktop-refresh-token-2'
    })
  })

  it('upgrades a legacy desktop cookie session to a body refresh session on refresh', async () => {
    const {
      getStoredAccessToken,
      restoreBrowserSession,
      setActiveApiClientContext
    } = await import('../../src/lib/api.js')

    setActiveApiClientContext({
      defaultSessionTransport: 'body',
      persistCsrfToStorage: false,
      initialAuthState: {
        accessToken: 'legacy-token',
        csrfToken: 'legacy-csrf-token',
        user: { id: 'desktop-legacy', email: 'legacy@example.com' }
      }
    })

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/session/refresh') {
        expect(payload).toEqual({})
        expect(config.headers['X-CSRF-Token']).toBe('legacy-csrf-token')
        return {
          data: {
            accessToken: 'legacy-refreshed-token',
            csrfToken: 'legacy-csrf-token-2',
            user: { id: 'desktop-legacy', email: 'legacy@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(payload).toEqual({
          transport: 'body',
          remember: true
        })
        expect(config.headers.Authorization).toBe('Bearer legacy-refreshed-token')
        return {
          data: {
            refreshToken: 'legacy-body-refresh-token',
            session: { id: 'session-legacy-upgraded', transport: 'body' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    const restored = await restoreBrowserSession({ forceRefresh: true })

    expect(restored).toEqual({
      accessToken: 'legacy-refreshed-token',
      csrfToken: 'legacy-csrf-token-2',
      user: {
        id: 'desktop-legacy',
        email: 'legacy@example.com'
      },
      refreshToken: 'legacy-body-refresh-token'
    })
    expect(getStoredAccessToken()).toBe('legacy-refreshed-token')
  })

  it('restores a cross-origin browser session with the persisted server-issued csrf token when cookies are unreadable on the frontend origin', async () => {
    const firstModule = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/login') {
        return {
          data: {
            accessToken: 'browser-token',
            user: { id: 'user-1', email: 'alex@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(config.headers.Authorization).toBe('Bearer browser-token')
        return {
          data: {
            csrfToken: 'server-issued-csrf-token',
            session: { id: 'session-1', transport: 'cookie' }
          }
        }
      }

      if (url === '/auth/session/refresh') {
        expect(config.headers['X-CSRF-Token']).toBe('server-issued-csrf-token')
        return {
          data: {
            accessToken: 'restored-token',
            csrfToken: 'rotated-csrf-token',
            user: { id: 'user-2', email: 'sam@example.com' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    await firstModule.login('alex@example.com', 'secret', { remember: true })

    vi.resetModules()
    globalThis.document = {
      cookie: ''
    }

    const {
      getCurrentUser,
      getStoredAccessToken,
      restoreBrowserSession
    } = await import('../../src/lib/api.js')

    const result = await restoreBrowserSession()

    expect(result).toEqual({
      accessToken: 'restored-token',
      csrfToken: 'rotated-csrf-token',
      user: {
        id: 'user-2',
        email: 'sam@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('restored-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-2',
      email: 'sam@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('restores a browser session through the refresh cookie and csrf header', async () => {
    const {
      getCurrentUser,
      getStoredAccessToken,
      restoreBrowserSession,
      setActiveApiClientContext
    } = await import('../../src/lib/api.js')
    setActiveApiClientContext({
      createAuthSessionDebugId: () => 'auth-debug-cookie'
    })
    globalThis.document.cookie = 'nebulynk_csrf_token=csrf-token'

    postMock.mockImplementation(async (url, payload, config) => {
      if (url !== '/auth/session/refresh') {
        throw new Error(`Unexpected POST ${url}`)
      }

      expect(payload).toEqual({})
      expect(config.headers['X-CSRF-Token']).toBe('csrf-token')
      expect(config.headers['X-Auth-Session-Debug-Id']).toBe('auth-debug-cookie')
      expect(config.__skipAuthRefresh).toBe(true)
      return {
        data: {
          accessToken: 'restored-token',
          user: { id: 'user-2', email: 'sam@example.com' }
        }
      }
    })

    const result = await restoreBrowserSession()

    expect(result).toEqual({
      accessToken: 'restored-token',
      user: {
        id: 'user-2',
        email: 'sam@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('restored-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-2',
      email: 'sam@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('prefers the readable csrf cookie over stale persisted csrf storage', async () => {
    const {
      getStoredAccessToken,
      restoreBrowserSession,
      setActiveApiClientContext
    } = await import('../../src/lib/api.js')
    setActiveApiClientContext({
      createAuthSessionDebugId: () => 'auth-debug-cookie-priority'
    })
    localStorage.setItem('nebulynk_csrf_token:client', 'stale-storage-csrf-token')
    globalThis.document.cookie = 'nebulynk_csrf_token=stale-cookie-csrf-token; nebulynk_csrf_token=current-cookie-csrf-token'

    postMock.mockImplementation(async (url, payload, config) => {
      if (url !== '/auth/session/refresh') {
        throw new Error(`Unexpected POST ${url}`)
      }

      expect(payload).toEqual({})
      expect(config.headers['X-CSRF-Token']).toBe('current-cookie-csrf-token')
      expect(config.headers['X-Auth-Session-Debug-Id']).toBe('auth-debug-cookie-priority')
      return {
        data: {
          accessToken: 'restored-cookie-priority-token',
          user: { id: 'user-2', email: 'sam@example.com' }
        }
      }
    })

    await expect(restoreBrowserSession()).resolves.toEqual({
      accessToken: 'restored-cookie-priority-token',
      user: {
        id: 'user-2',
        email: 'sam@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('restored-cookie-priority-token')
  })

  it('warns with restore diagnostics when cookie refresh fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const {
        getStoredAccessToken,
        restoreBrowserSession,
        setActiveApiClientContext
      } = await import('../../src/lib/api.js')

      setActiveApiClientContext({
        baseUrl: 'https://api.example.test/api',
        createAuthSessionDebugId: () => 'auth-debug-fail'
      })
      localStorage.setItem('nebulynk_csrf_token:client', 'csrf-token')

      const refreshError = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            error_code: 'api.auth_session.invalid_csrf_token'
          }
        }
      }
      postMock.mockRejectedValueOnce(refreshError)

      await expect(restoreBrowserSession({ forceRefresh: true })).rejects.toMatchObject(refreshError)

      expect(postMock).toHaveBeenCalledWith('/auth/session/refresh', {}, expect.objectContaining({
        __skipAuthRefresh: true,
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf-token',
          'X-Auth-Session-Debug-Id': 'auth-debug-fail'
        })
      }))
      expect(consoleWarn).toHaveBeenCalledWith('Auth session restore failed', expect.objectContaining({
        reason: 'refresh_failed',
        status: 403,
        errorCode: 'api.auth_session.invalid_csrf_token',
        authSessionDebugId: 'auth-debug-fail',
        transport: 'cookie',
        csrf: expect.objectContaining({
          available: true,
          source: 'storage',
          storagePresent: true,
          cookiePresent: false
        }),
        apiBaseUrl: expect.objectContaining({
          kind: 'absolute',
          origin: 'https://api.example.test',
          sameOrigin: false,
          endsWithApi: true
        })
      }))
      expect(getStoredAccessToken()).toBe(null)
      expect(localStorage.getItem('accessToken')).toBe(null)
      expect(sessionStorage.getItem('accessToken')).toBe(null)
    } finally {
      consoleWarn.mockRestore()
    }
  })

  it('forceRefresh bypasses a stale in-memory token and refreshes through the cookie session', async () => {
    const {
      getCurrentUser,
      getStoredAccessToken,
      restoreBrowserSession,
      storeAuthenticationResult
    } = await import('../../src/lib/api.js')

    storeAuthenticationResult({
      accessToken: 'expired-token',
      user: { id: 'user-stale', email: 'stale@example.com' }
    })
    globalThis.document.cookie = 'nebulynk_csrf_token=csrf-token'

    postMock.mockImplementation(async (url, payload, config) => {
      if (url !== '/auth/session/refresh') {
        throw new Error(`Unexpected POST ${url}`)
      }

      expect(payload).toEqual({})
      expect(config.headers['X-CSRF-Token']).toBe('csrf-token')
      expect(config.__skipAuthRefresh).toBe(true)
      return {
        data: {
          accessToken: 'forced-refresh-token',
          user: { id: 'user-fresh', email: 'fresh@example.com' }
        }
      }
    })

    const result = await restoreBrowserSession({ forceRefresh: true })

    expect(result).toEqual({
      accessToken: 'forced-refresh-token',
      user: {
        id: 'user-fresh',
        email: 'fresh@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('forced-refresh-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-fresh',
      email: 'fresh@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('401 responses retry once with a forced refresh token instead of the stale in-memory token', async () => {
    const {
      storeAuthenticationResult
    } = await import('../../src/lib/api.js')

    storeAuthenticationResult({
      accessToken: 'expired-token',
      user: { id: 'user-1', email: 'alex@example.com' }
    })
    globalThis.document.cookie = 'nebulynk_csrf_token=csrf-token'

    postMock.mockImplementation(async (url, payload, config) => {
      if (url !== '/auth/session/refresh') {
        throw new Error(`Unexpected POST ${url}`)
      }

      expect(config.headers['X-CSRF-Token']).toBe('csrf-token')
      return {
        data: {
          accessToken: 'rotated-token',
          user: { id: 'user-1', email: 'alex@example.com' }
        }
      }
    })
    apiCallMock.mockImplementation(async (config) => ({
      data: {
        ok: true,
        authorization: config.headers.Authorization
      }
    }))

    const result = await responseInterceptorState.rejected({
      config: {
        url: '/channels',
        headers: {
          Authorization: 'Bearer expired-token'
        }
      },
      response: {
        status: 401
      }
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(apiCallMock).toHaveBeenCalledTimes(1)
    expect(apiCallMock).toHaveBeenCalledWith(expect.objectContaining({
      __authRetryAttempted: true,
      headers: expect.objectContaining({
        Authorization: 'Bearer rotated-token'
      })
    }))
    expect(result).toEqual({
      data: {
        ok: true,
        authorization: 'Bearer rotated-token'
      }
    })
  })

  it('proactively refreshes body sessions before token expiry and replans after rotation', async () => {
    vi.useFakeTimers()
    const baseNow = new Date('2026-05-28T12:00:00.000Z')
    vi.setSystemTime(baseNow)

    try {
      const {
        getStoredAccessToken,
        login,
        setActiveApiClientContext
      } = await import('../../src/lib/api.js')

      setActiveApiClientContext({
        defaultSessionTransport: 'body',
        persistCsrfToStorage: false
      })

      const loginToken = createTestJwt({
        exp: Math.floor((baseNow.getTime() + (15 * 60 * 1000)) / 1000)
      })
      const refreshedToken = createTestJwt({
        exp: Math.floor((baseNow.getTime() + (29 * 60 * 1000)) / 1000)
      })
      const rotatedToken = createTestJwt({
        exp: Math.floor((baseNow.getTime() + (43 * 60 * 1000)) / 1000)
      })

      postMock.mockImplementation(async (url, payload, config) => {
        if (url === '/auth/login') {
          expect(payload).toEqual({
            email: 'desktop@example.com',
            password: 'secret',
            remember: true
          })
          return {
            data: {
              accessToken: loginToken,
              user: { id: 'desktop-user', email: 'desktop@example.com' }
            }
          }
        }

        if (url === '/auth/session/bootstrap') {
          expect(config.headers.Authorization).toBe(`Bearer ${loginToken}`)
          return {
            data: {
              refreshToken: 'refresh-token-1',
              session: { id: 'session-desktop', transport: 'body' }
            }
          }
        }

        if (url === '/auth/session/refresh') {
          if (payload.refreshToken === 'refresh-token-1') {
            return {
              data: {
                accessToken: refreshedToken,
                refreshToken: 'refresh-token-2',
                user: { id: 'desktop-user', email: 'desktop@example.com' }
              }
            }
          }

          if (payload.refreshToken === 'refresh-token-2') {
            return {
              data: {
                accessToken: rotatedToken,
                refreshToken: 'refresh-token-3',
                user: { id: 'desktop-user', email: 'desktop@example.com' }
              }
            }
          }
        }

        throw new Error(`Unexpected POST ${url}`)
      })

      await login('desktop@example.com', 'secret', { remember: true })

      expect(getStoredAccessToken()).toBe(loginToken)
      expect(postMock).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync((14 * 60 * 1000) - 1)
      expect(postMock).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(1)
      expect(postMock).toHaveBeenCalledTimes(3)
      expect(getStoredAccessToken()).toBe(refreshedToken)

      await vi.advanceTimersByTimeAsync((14 * 60 * 1000) - 1)
      expect(postMock).toHaveBeenCalledTimes(3)

      await vi.advanceTimersByTimeAsync(1)
      expect(postMock).toHaveBeenCalledTimes(4)
      expect(getStoredAccessToken()).toBe(rotatedToken)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears proactive refresh timers when auth state is cleared', async () => {
    vi.useFakeTimers()
    const baseNow = new Date('2026-05-28T12:00:00.000Z')
    vi.setSystemTime(baseNow)

    try {
      const {
        clearStoredAuth,
        setActiveApiClientContext,
        storeAuthenticationResult
      } = await import('../../src/lib/api.js')

      setActiveApiClientContext({
        defaultSessionTransport: 'body',
        persistCsrfToStorage: false,
        initialAuthState: {
          refreshToken: 'refresh-token-1',
          sessionTransport: 'body'
        }
      })

      storeAuthenticationResult({
        accessToken: createTestJwt({
          exp: Math.floor((baseNow.getTime() + (15 * 60 * 1000)) / 1000)
        }),
        user: { id: 'user-1', email: 'alex@example.com' }
      })

      clearStoredAuth()
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

      expect(postMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not schedule proactive refresh without a usable refresh path', async () => {
    vi.useFakeTimers()
    const baseNow = new Date('2026-05-28T12:00:00.000Z')
    vi.setSystemTime(baseNow)

    try {
      const {
        setActiveApiClientContext,
        storeAuthenticationResult
      } = await import('../../src/lib/api.js')

      setActiveApiClientContext({
        defaultSessionTransport: 'body',
        persistCsrfToStorage: false
      })

      storeAuthenticationResult({
        accessToken: createTestJwt({
          exp: Math.floor((baseNow.getTime() + (15 * 60 * 1000)) / 1000)
        }),
        user: { id: 'user-1', email: 'alex@example.com' }
      })

      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)

      expect(postMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs out through the cookie session endpoint and clears in-memory auth state', async () => {
    const { getCurrentUser, getStoredAccessToken, login, logout } = await import('../../src/lib/api.js')
    globalThis.document.cookie = 'nebulynk_csrf_token=csrf-token'

    postMock.mockImplementation(async (url) => {
      if (url === '/auth/login') {
        return {
          data: {
            accessToken: 'logout-token',
            user: { id: 'user-3', email: 'logout@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        return {
          data: {
            session: { id: 'session-2', transport: 'cookie' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })
    deleteMock.mockResolvedValue({ status: 204 })

    await login('logout@example.com', 'secret', { remember: false })
    await logout()

    expect(deleteMock).toHaveBeenCalledWith('/auth/session', expect.objectContaining({
      __skipAuthRefresh: true,
      headers: {
        'X-CSRF-Token': 'csrf-token'
      }
    }))
    expect(getStoredAccessToken()).toBe(null)
    expect(getCurrentUser()).toBe(null)
  })

  it('logs out through the desktop body session endpoint with the persisted refresh token', async () => {
    const {
      getCurrentUser,
      getStoredAccessToken,
      logout,
      setActiveApiClientContext
    } = await import('../../src/lib/api.js')

    setActiveApiClientContext({
      defaultSessionTransport: 'body',
      persistCsrfToStorage: false,
      initialAuthState: {
        accessToken: 'desktop-logout-token',
        refreshToken: 'desktop-logout-refresh-token',
        sessionTransport: 'body',
        user: { id: 'desktop-user', email: 'desktop@example.com' }
      }
    })

    deleteMock.mockResolvedValue({ status: 204 })

    await logout()

    expect(deleteMock).toHaveBeenCalledWith('/auth/session', expect.objectContaining({
      __skipAuthRefresh: true,
      data: {
        refreshToken: 'desktop-logout-refresh-token'
      },
      headers: {
        'X-Refresh-Token': 'desktop-logout-refresh-token'
      }
    }))
    expect(getStoredAccessToken()).toBe(null)
    expect(getCurrentUser()).toBe(null)
  })

  it('returns a 2FA challenge without bootstrapping a browser session yet', async () => {
    const { getStoredAccessToken, login } = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload) => {
      if (url !== '/auth/login') {
        throw new Error(`Unexpected POST ${url}`)
      }

      expect(payload).toEqual({
        email: 'alex@example.com',
        password: 'secret',
        remember: false
      })

      return {
        data: {
          requiresTwoFactor: true,
          challengeId: 'challenge-1',
          remember: false,
          availableMethods: ['totp', 'recovery_code']
        }
      }
    })

    const result = await login('alex@example.com', 'secret', { remember: false })

    expect(result).toEqual({
      requiresTwoFactor: true,
      challengeId: 'challenge-1',
      remember: false,
      availableMethods: ['totp', 'recovery_code']
    })
    expect(getStoredAccessToken()).toBe(null)
  })

  it('verifies a 2FA login challenge and then bootstraps the browser session', async () => {
    const { getCurrentUser, getStoredAccessToken, verifyTwoFactorLogin } = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/login/verify-2fa') {
        expect(payload).toEqual({
          challengeId: 'challenge-1',
          method: 'totp',
          code: '123456'
        })
        expect(config.__skipAuthRefresh).toBe(true)
        return {
          data: {
            accessToken: 'verified-token',
            user: { id: 'user-1', email: 'alex@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(payload).toEqual({
          transport: 'cookie',
          remember: true
        })
        expect(config.headers.Authorization).toBe('Bearer verified-token')
        return {
          data: {
            csrfToken: 'bootstrap-csrf-token',
            session: { id: 'session-1', transport: 'cookie' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    const result = await verifyTwoFactorLogin({
      challengeId: 'challenge-1',
      method: 'totp',
      code: '123456',
      remember: true
    })

    expect(result).toEqual({
      accessToken: 'verified-token',
      user: {
        id: 'user-1',
        email: 'alex@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('verified-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-1',
      email: 'alex@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('verifies a passkey login challenge and then bootstraps the browser session', async () => {
    const { beginPasskeyAuthentication, getCurrentUser, getStoredAccessToken, verifyPasskeyAuthentication } = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/auth/passkeys/authentication-options') {
        expect(payload).toEqual({
          remember: false
        })
        expect(config.__skipAuthRefresh).toBe(true)
        return {
          data: {
            challengeId: 'passkey-challenge-1',
            options: { challenge: 'passkey-options' }
          }
        }
      }

      if (url === '/auth/passkeys/verify-authentication') {
        expect(payload).toEqual({
          challengeId: 'passkey-challenge-1',
          authenticationResponse: { id: 'credential-1' }
        })
        expect(config.__skipAuthRefresh).toBe(true)
        return {
          data: {
            accessToken: 'passkey-token',
            user: { id: 'user-passkey', email: 'passkey@example.com' }
          }
        }
      }

      if (url === '/auth/session/bootstrap') {
        expect(payload).toEqual({
          transport: 'cookie',
          remember: false
        })
        expect(config.headers.Authorization).toBe('Bearer passkey-token')
        return {
          data: {
            csrfToken: 'bootstrap-csrf-token',
            session: { id: 'session-passkey', transport: 'cookie' }
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    await expect(beginPasskeyAuthentication({ remember: false })).resolves.toEqual({
      challengeId: 'passkey-challenge-1',
      options: { challenge: 'passkey-options' }
    })

    const result = await verifyPasskeyAuthentication({
      challengeId: 'passkey-challenge-1',
      authenticationResponse: { id: 'credential-1' },
      remember: false
    })

    expect(result).toEqual({
      accessToken: 'passkey-token',
      user: {
        id: 'user-passkey',
        email: 'passkey@example.com'
      }
    })
    expect(getStoredAccessToken()).toBe('passkey-token')
    expect(getCurrentUser()).toEqual({
      id: 'user-passkey',
      email: 'passkey@example.com',
      meeting_video_preferences: DEFAULT_MEETING_VIDEO_PREFERENCES
    })
  })

  it('exposes password reset helpers without auth-refresh coupling', async () => {
    const {
      beginPasskeyRegistration,
      beginPrimaryAdminTransferPasskeyOptions,
      beginPasskeyAuthentication,
      beginTwoFactorSetup,
      changePassword,
      confirmTwoFactorSetup,
      deletePasskey,
      disableTwoFactor,
      getPasskeys,
      getTwoFactorStatus,
      regenerateTwoFactorRecoveryCodes,
      resetUserPasskeys,
      transferPrimaryAdmin,
      resetUserTwoFactor,
      requestPasswordReset,
      resetPassword,
      validatePasswordResetToken,
      verifyPasskeyRegistration
    } = await import('../../src/lib/api.js')

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/password-reset') {
        expect(payload).toEqual({ email: 'user@example.com' })
        expect(config.__skipAuthRefresh).toBe(true)
        return { data: { ok: true } }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    getMock.mockImplementation(async (url, config) => {
      if (url === '/password-reset') {
        expect(config.__skipAuthRefresh).toBe(true)
        expect(config.params).toEqual({ token: 'reset-token' })
        return { data: { ok: true } }
      }

      throw new Error(`Unexpected GET ${url}`)
    })

    patchMock.mockImplementation(async (url, payload, config) => {
      if (url === '/password-reset/reset-token') {
        expect(payload).toEqual({ password: 'NewPassw0rd!' })
        expect(config.__skipAuthRefresh).toBe(true)
        return { data: { ok: true } }
      }

      throw new Error(`Unexpected PATCH ${url}`)
    })

    postMock.mockImplementation(async (url, payload, config) => {
      if (url === '/password-reset') {
        expect(payload).toEqual({ email: 'user@example.com' })
        expect(config.__skipAuthRefresh).toBe(true)
        return { data: { ok: true } }
      }

      if (url === '/password-change') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!',
          new_password: 'NewPassw0rd!'
        })
        expect(config).toBeUndefined()
        return { data: { ok: true } }
      }

      if (url === '/users/me/2fa/setup') {
        expect(payload).toEqual({})
        return { data: { pendingSetup: true } }
      }

      if (url === '/auth/passkeys/authentication-options') {
        expect(payload).toEqual({ remember: true })
        expect(config.__skipAuthRefresh).toBe(true)
        return { data: { challengeId: 'passkey-challenge-1', options: {} } }
      }

      if (url === '/users/me/2fa/confirm') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!',
          code: '123456'
        })
        return { data: { enabled: true } }
      }

      if (url === '/users/me/2fa/recovery-codes/regenerate') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!',
          code: '123456'
        })
        return { data: { recoveryCodes: ['ABCD-EFGH-IJKL'] } }
      }

      if (url === '/users/me/2fa/disable') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!',
          code: '123456'
        })
        return { data: { ok: true } }
      }

      if (url === '/users/member-1/2fa/reset') {
        expect(payload).toEqual({})
        return { data: { ok: true } }
      }

      if (url === '/users/me/passkeys/registration-options') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!'
        })
        return { data: { challengeId: 'passkey-challenge-1', options: {} } }
      }

      if (url === '/users/me/passkeys/verify-registration') {
        expect(payload).toEqual({
          challengeId: 'passkey-challenge-1',
          registrationResponse: { id: 'credential-1' },
          name: 'Laptop'
        })
        return { data: { passkey: { id: 'passkey-1' } } }
      }

      if (url === '/users/me/passkeys/passkey-1/delete') {
        expect(payload).toEqual({
          current_password: 'CurrentPassw0rd!'
        })
        return { data: { ok: true } }
      }

      if (url === '/users/member-1/passkeys/reset') {
        expect(payload).toEqual({})
        return { data: { ok: true, user_id: 'member-1', passkey_count: 0 } }
      }

      if (url === '/admin/primary-admin-transfer/passkey-options') {
        expect(payload).toEqual({})
        return { data: { challengeId: 'primary-passkey-challenge', options: { challenge: 'passkey-options' } } }
      }

      if (url === '/admin/primary-admin-transfer') {
        expect(payload).toEqual({
          target_user_id: 'member-1',
          confirmation: 'TRANSFER_PRIMARY_ADMIN',
          reauth: { method: 'password', current_password: 'CurrentPassw0rd!' }
        })
        return {
          data: {
            ok: true,
            previous_primary_admin_id: 'admin-1',
            primary_admin_id: 'member-1'
          }
        }
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    await expect(requestPasswordReset('user@example.com')).resolves.toEqual({ ok: true })
    await expect(validatePasswordResetToken('reset-token')).resolves.toEqual({ ok: true })
    await expect(resetPassword('reset-token', 'NewPassw0rd!')).resolves.toEqual({ ok: true })
    await expect(changePassword({
      currentPassword: 'CurrentPassw0rd!',
      newPassword: 'NewPassw0rd!'
    })).resolves.toEqual({ ok: true })
    await expect(beginTwoFactorSetup()).resolves.toEqual({ pendingSetup: true })
    await expect(beginPasskeyAuthentication({ remember: true })).resolves.toEqual({ challengeId: 'passkey-challenge-1', options: {} })
    await expect(beginPasskeyRegistration({
      currentPassword: 'CurrentPassw0rd!'
    })).resolves.toEqual({ challengeId: 'passkey-challenge-1', options: {} })
    await expect(confirmTwoFactorSetup({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ enabled: true })
    await expect(regenerateTwoFactorRecoveryCodes({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ recoveryCodes: ['ABCD-EFGH-IJKL'] })
    await expect(disableTwoFactor({
      currentPassword: 'CurrentPassw0rd!',
      code: '123456'
    })).resolves.toEqual({ ok: true })
    await expect(verifyPasskeyRegistration({
      challengeId: 'passkey-challenge-1',
      registrationResponse: { id: 'credential-1' },
      name: 'Laptop'
    })).resolves.toEqual({ passkey: { id: 'passkey-1' } })
    await expect(deletePasskey('passkey-1', {
      currentPassword: 'CurrentPassw0rd!'
    })).resolves.toEqual({ ok: true })
    await expect(resetUserTwoFactor('member-1')).resolves.toEqual({ ok: true })
    await expect(resetUserPasskeys('member-1')).resolves.toEqual({ ok: true, user_id: 'member-1', passkey_count: 0 })
    await expect(beginPrimaryAdminTransferPasskeyOptions()).resolves.toEqual({
      challengeId: 'primary-passkey-challenge',
      options: { challenge: 'passkey-options' }
    })
    await expect(transferPrimaryAdmin({
      targetUserId: 'member-1',
      confirmation: 'TRANSFER_PRIMARY_ADMIN',
      reauth: { method: 'password', current_password: 'CurrentPassw0rd!' }
    })).resolves.toEqual({
      ok: true,
      previous_primary_admin_id: 'admin-1',
      primary_admin_id: 'member-1'
    })
  })

  it('loads the 2FA status without auth-refresh coupling', async () => {
    const { getPasskeys, getTwoFactorStatus } = await import('../../src/lib/api.js')

    getMock.mockImplementation(async (url) => {
      if (url !== '/users/me/2fa') {
        if (url === '/users/me/passkeys') {
          return {
            data: {
              passkeys: [{ id: 'passkey-1' }]
            }
          }
        }
        throw new Error(`Unexpected GET ${url}`)
      }

      return {
        data: {
          enabled: true,
          method: 'totp',
          recoveryCodesRemaining: 7,
          pendingSetup: false
        }
      }
    })

    await expect(getTwoFactorStatus()).resolves.toEqual({
      enabled: true,
      method: 'totp',
      recoveryCodesRemaining: 7,
      pendingSetup: false
    })
    await expect(getPasskeys()).resolves.toEqual({
      passkeys: [{ id: 'passkey-1' }]
    })
  })
})
