import { normalizeMeetingVideoPreferences } from '../meeting-video-preferences.js'
import { readViteEnv, resolveApiBaseUrlShape } from './base-url.js'

const configuredCsrfCookieName = readViteEnv('VITE_AUTH_CSRF_COOKIE_NAME')

const DEFAULT_CSRF_COOKIE_NAME = configuredCsrfCookieName || 'nebulynk_csrf_token'

const DEFAULT_CSRF_STORAGE_KEY = `${DEFAULT_CSRF_COOKIE_NAME}:client`

const DEFAULT_PROACTIVE_REFRESH_LEEWAY_MS = 60_000

function createDefaultAuthSessionDebugId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `auth-${globalThis.crypto.randomUUID()}`
    }
  } catch {
    // Fall back below when crypto is unavailable.
  }

  const randomPart = Math.random().toString(36).slice(2, 10)
  return `auth-${Date.now().toString(36)}-${randomPart}`
}

function normalizeSessionTransport(value) {
  return value === 'body' ? 'body' : 'cookie'
}

function readCookie(name) {
  if (typeof document === 'undefined' || !name) return null

  const cookieString = document.cookie || ''
  const entries = cookieString.split(';')
  let matchedValue = null
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf('=')
    const key = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex)
    if (key !== name) continue

    const rawValue = separatorIndex === -1 ? '' : trimmed.slice(separatorIndex + 1)
    matchedValue = decodeURIComponent(rawValue)
  }

  return matchedValue
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null
  return {
    ...user,
    meeting_video_preferences: normalizeMeetingVideoPreferences(user.meeting_video_preferences)
  }
}

function defaultReadStorage(key) {
  if (typeof globalThis === 'undefined' || !key) return null

  try {
    return globalThis.localStorage?.getItem?.(key) || null
  } catch {
    return null
  }
}

function defaultWriteStorage(key, value) {
if (typeof globalThis === 'undefined' || !key) return

try {
    if (typeof value === 'string' && value) {
      globalThis.localStorage?.setItem?.(key, value)
      return
    }

    globalThis.localStorage?.removeItem?.(key)
  } catch {
    // Ignore storage failures in hardened environments.
}
}

function redirectToLoginIfNeeded() {
  if (typeof window === 'undefined') return
  const blockedPaths = new Set(['/login', '/setup'])
  if (!blockedPaths.has(window.location.pathname)) {
    window.location.href = '/login'
  }
}

function normalizeJwtSegment(segment) {
  if (typeof segment !== 'string' || !segment) return ''

  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = normalized.length % 4
  if (remainder === 0) return normalized
  return `${normalized}${'='.repeat(4 - remainder)}`
}

function decodeBase64UrlJson(segment) {
  const normalized = normalizeJwtSegment(segment)
  if (!normalized) return null

  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(normalized)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const text = new TextDecoder().decode(bytes)
      return JSON.parse(text)
    }

    if (typeof globalThis.Buffer !== 'undefined') {
      const text = globalThis.Buffer.from(normalized, 'base64').toString('utf8')
      return JSON.parse(text)
    }
  } catch {
    return null
  }

  return null
}

function resolveAccessTokenExpiryMs(accessToken) {
  if (typeof accessToken !== 'string') return null
  const segments = accessToken.split('.')
  if (segments.length < 2) return null

  const payload = decodeBase64UrlJson(segments[1])
  const exp = Number(payload?.exp)
  if (!Number.isFinite(exp) || exp <= 0) return null
  return exp * 1000
}

function getAuthErrorDetails(error) {
  return {
    status: error?.response?.status || null,
    errorCode: error?.response?.data?.error_code || error?.response?.data?.code || null,
    message: error?.message || null
  }
}

export function createApiSession({ http, getBaseUrl }, options = {}) {
  const csrfStorageKey = options.csrfStorageKey || DEFAULT_CSRF_STORAGE_KEY
  const defaultSessionTransport = normalizeSessionTransport(options.defaultSessionTransport)
  const proactiveRefreshLeewayMs = Number.isFinite(Number(options.proactiveRefreshLeewayMs))
    ? Math.max(0, Math.trunc(Number(options.proactiveRefreshLeewayMs)))
    : DEFAULT_PROACTIVE_REFRESH_LEEWAY_MS
  const readStorage = typeof options.readStorage === 'function' ? options.readStorage : defaultReadStorage
  const writeStorage = typeof options.writeStorage === 'function' ? options.writeStorage : defaultWriteStorage
  const scheduleTimeout = typeof options.setTimeout === 'function'
    ? options.setTimeout
    : globalThis.setTimeout?.bind(globalThis)
  const cancelTimeout = typeof options.clearTimeout === 'function'
    ? options.clearTimeout
    : globalThis.clearTimeout?.bind(globalThis)
  const getNow = typeof options.now === 'function' ? options.now : Date.now
  const createAuthSessionDebugId = typeof options.createAuthSessionDebugId === 'function'
    ? options.createAuthSessionDebugId
    : createDefaultAuthSessionDebugId
  const authListeners = new Set()
  const authState = {
    accessToken: typeof options.initialAuthState?.accessToken === 'string'
      ? options.initialAuthState.accessToken
      : null,
    user: normalizeUser(options.initialAuthState?.user || null),
    csrfToken: typeof options.initialAuthState?.csrfToken === 'string'
      ? options.initialAuthState.csrfToken
      : null,
    refreshToken: typeof options.initialAuthState?.refreshToken === 'string'
      ? options.initialAuthState.refreshToken
      : null,
    sessionTransport: normalizeSessionTransport(
      options.initialAuthState?.sessionTransport || defaultSessionTransport
    )
  }
  let refreshRequest = null
  let proactiveRefreshTimerId = null
  let destroyed = false

  function notifyAuthListeners() {
    if (destroyed) return

    const snapshot = {
      accessToken: authState.accessToken,
      user: normalizeUser(authState.user),
      csrfToken: authState.csrfToken,
      refreshToken: authState.refreshToken,
      sessionTransport: authState.sessionTransport
    }
    scheduleProactiveSessionRefresh()
    for (const listener of authListeners) {
      listener(snapshot)
    }
    options.onPersistAuthState?.(snapshot)
  }

  function clearProactiveSessionRefresh() {
    if (proactiveRefreshTimerId == null || typeof cancelTimeout !== 'function') return
    cancelTimeout(proactiveRefreshTimerId)
    proactiveRefreshTimerId = null
  }

  function hasBodyRefreshCapability() {
    return typeof authState.refreshToken === 'string' && authState.refreshToken.trim().length > 0
  }

  function hasCookieRefreshCapability() {
    return !!getStoredCsrfToken()
  }

  function hasRefreshCapability() {
    if (authState.sessionTransport === 'body') {
      return hasBodyRefreshCapability()
    }

    if (authState.sessionTransport === 'cookie') {
      return hasCookieRefreshCapability()
    }

    return hasBodyRefreshCapability() || hasCookieRefreshCapability()
  }

  function scheduleProactiveSessionRefresh() {
    clearProactiveSessionRefresh()

    if (destroyed || typeof scheduleTimeout !== 'function') return
    if (!authState.accessToken || !hasRefreshCapability()) return

    const expiryAtMs = resolveAccessTokenExpiryMs(authState.accessToken)
    if (!Number.isFinite(expiryAtMs)) return

    const refreshAtMs = expiryAtMs - proactiveRefreshLeewayMs
    const delayMs = Math.max(0, refreshAtMs - getNow())

    proactiveRefreshTimerId = scheduleTimeout(async () => {
      proactiveRefreshTimerId = null

      if (destroyed || !authState.accessToken || !hasRefreshCapability()) {
        return
      }

      try {
        await restoreBrowserSession({ forceRefresh: true })
      } catch {
        if (options.redirectOnAuthFailure !== false) {
          redirectToLoginIfNeeded()
        }
      }
    }, delayMs)
  }

  function setAuthenticationState({
    accessToken = null,
    user = null,
    refreshToken,
    sessionTransport
  } = {}) {
    authState.accessToken = typeof accessToken === 'string' && accessToken.trim()
      ? accessToken
      : null
    authState.user = normalizeUser(user)
    if (refreshToken !== undefined) {
      authState.refreshToken = typeof refreshToken === 'string' && refreshToken.trim()
        ? refreshToken
        : null
    }
    if (sessionTransport !== undefined) {
      authState.sessionTransport = normalizeSessionTransport(sessionTransport)
    }
    notifyAuthListeners()
  }

  function setStoredCsrfToken(token) {
    const normalizedToken = typeof token === 'string' && token.trim()
      ? token.trim()
      : null

    authState.csrfToken = normalizedToken
    if (options.persistCsrfToStorage !== false) {
      writeStorage(csrfStorageKey, normalizedToken)
    }
    notifyAuthListeners()
  }

  function readStoredCsrfToken() {
    if (options.persistCsrfToStorage === false) {
      return null
    }

    try {
      return readStorage(csrfStorageKey)
    } catch {
      return null
    }
  }

  function getCsrfTokenState({ updateAuthState = true } = {}) {
    const memoryToken = typeof authState.csrfToken === 'string' && authState.csrfToken.trim()
      ? authState.csrfToken.trim()
      : null
    const storageToken = readStoredCsrfToken()
    const cookieToken = readCookie(DEFAULT_CSRF_COOKIE_NAME)

    const source = cookieToken
      ? 'cookie'
      : memoryToken
        ? 'memory'
        : storageToken
          ? 'storage'
          : null
    const token = cookieToken || memoryToken || storageToken || null

    if (updateAuthState && token) {
      authState.csrfToken = token
    }

    return {
      token,
      source,
      available: Boolean(token),
      memoryPresent: Boolean(memoryToken),
      storagePresent: Boolean(storageToken),
      cookiePresent: Boolean(cookieToken)
    }
  }

  function getStoredCsrfToken() {
    return getCsrfTokenState().token
  }

  function buildRefreshDiagnosticContext(transport) {
    const csrf = getCsrfTokenState({ updateAuthState: false })
    return {
      authSessionDebugId: createAuthSessionDebugId(),
      transport,
      defaultSessionTransport,
      csrf: {
        available: csrf.available,
        source: csrf.source,
        memoryPresent: csrf.memoryPresent,
        storagePresent: csrf.storagePresent,
        cookiePresent: csrf.cookiePresent
      },
      apiBaseUrl: resolveApiBaseUrlShape(getBaseUrl())
    }
  }

  function logSessionRestoreWarning(reason, error, diagnosticContext = null) {
    if (options.logAuthSessionDiagnostics === false) return
    if (typeof console === 'undefined' || typeof console.warn !== 'function') return

    console.warn('Auth session restore failed', {
      reason,
      ...getAuthErrorDetails(error),
      authSessionDebugId: diagnosticContext?.authSessionDebugId || null,
      transport: diagnosticContext?.transport || null,
      defaultSessionTransport: diagnosticContext?.defaultSessionTransport || defaultSessionTransport,
      csrf: diagnosticContext?.csrf || {
        available: false,
        source: null,
        memoryPresent: false,
        storagePresent: false,
        cookiePresent: false
      },
      apiBaseUrl: diagnosticContext?.apiBaseUrl || resolveApiBaseUrlShape(getBaseUrl())
    })
  }

  function syncCsrfToken(data) {
    const responseToken = typeof data?.csrfToken === 'string' && data.csrfToken.trim()
      ? data.csrfToken.trim()
      : null

    if (responseToken) {
      setStoredCsrfToken(responseToken)
      return responseToken
    }

    const cookieToken = readCookie(DEFAULT_CSRF_COOKIE_NAME)
    if (cookieToken) {
      setStoredCsrfToken(cookieToken)
      return cookieToken
    }

    return getStoredCsrfToken()
  }

  function getRefreshTransport() {
    if (authState.sessionTransport === 'body' && authState.refreshToken) {
      return 'body'
    }
    if (authState.sessionTransport === 'cookie' || getStoredCsrfToken()) {
      return 'cookie'
    }
    return authState.refreshToken ? 'body' : defaultSessionTransport
  }

  function buildAuthReturnPayload() {
    const payload = {
      accessToken: authState.accessToken,
      user: normalizeUser(authState.user)
    }

    if (authState.csrfToken) {
      payload.csrfToken = authState.csrfToken
    }
    if (authState.refreshToken) {
      payload.refreshToken = authState.refreshToken
    }

    return payload
  }

  function buildRefreshReturnPayload(refreshed = {}) {
    const payload = {
      ...refreshed
    }

    if (authState.refreshToken && payload.refreshToken === undefined) {
      payload.refreshToken = authState.refreshToken
    }

    return payload
  }

  async function bootstrapBrowserSession(accessToken, {
    remember = true,
    sessionTransport = defaultSessionTransport
  } = {}) {
    const transport = normalizeSessionTransport(sessionTransport)
    const { data } = await http.post('/auth/session/bootstrap', {
      transport,
      remember
    }, {
      __skipAuthRefresh: true,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (transport === 'body') {
      setStoredCsrfToken(null)
      setAuthenticationState({
        accessToken: authState.accessToken,
        user: authState.user,
        refreshToken: data?.refreshToken || null,
        sessionTransport: 'body'
      })
    } else {
      syncCsrfToken(data)
      setAuthenticationState({
        accessToken: authState.accessToken,
        user: authState.user,
        refreshToken: null,
        sessionTransport: 'cookie'
      })
    }

    return data
  }

  async function runCookieRefreshRequest(diagnosticContext = null) {
    const csrfToken = getStoredCsrfToken()
    if (!csrfToken) {
      return null
    }

    const { data } = await http.post('/auth/session/refresh', {}, {
      __skipAuthRefresh: true,
      headers: {
        'X-CSRF-Token': csrfToken,
        'X-Auth-Session-Debug-Id': diagnosticContext?.authSessionDebugId || createAuthSessionDebugId()
      }
    })

    setAuthenticationState({
      accessToken: authState.accessToken,
      user: authState.user,
      refreshToken: null,
      sessionTransport: 'cookie'
    })
    return storeAuthenticationResult(data)
  }

  async function runBodyRefreshRequest(diagnosticContext = null) {
    const refreshToken = typeof authState.refreshToken === 'string' && authState.refreshToken.trim()
      ? authState.refreshToken.trim()
      : ''
    if (!refreshToken) {
      return null
    }

    const { data } = await http.post('/auth/session/refresh', {
      refreshToken
    }, {
      __skipAuthRefresh: true,
      headers: {
        'X-Auth-Session-Debug-Id': diagnosticContext?.authSessionDebugId || createAuthSessionDebugId()
      }
    })

    setStoredCsrfToken(null)
    setAuthenticationState({
      accessToken: authState.accessToken,
      user: authState.user,
      refreshToken: data?.refreshToken || null,
      sessionTransport: 'body'
    })
    return storeAuthenticationResult(data)
  }

  function clearStoredAuth() {
    clearProactiveSessionRefresh()
    setAuthenticationState({
      accessToken: null,
      user: null,
      refreshToken: null,
      sessionTransport: defaultSessionTransport
    })
    if (options.persistCsrfToStorage !== false) {
      setStoredCsrfToken(null)
    } else {
      authState.csrfToken = null
      notifyAuthListeners()
    }
  }

  function getStoredAccessToken() {
    return authState.accessToken
  }

  function getCurrentUser() {
    return normalizeUser(authState.user)
  }

  function subscribeToAuthState(listener) {
    authListeners.add(listener)
    return () => {
      authListeners.delete(listener)
    }
  }

  function storeAuthenticationResult(data) {
    if (authState.sessionTransport === 'cookie') {
      syncCsrfToken(data)
    }
    setAuthenticationState({
      accessToken: data?.accessToken || null,
      user: data?.user || null
    })
    return data
  }

  async function completeBrowserAuthentication(data, {
    remember = true,
    sessionTransport = defaultSessionTransport
  } = {}) {
    storeAuthenticationResult(data)
    if (!data?.accessToken) {
      return data
    }

    try {
      await bootstrapBrowserSession(data.accessToken, { remember, sessionTransport })
      return data
    } catch (error) {
      clearStoredAuth()
      throw error
    }
  }

  async function restoreBrowserSession(options = {}) {
    const forceRefresh = options?.forceRefresh === true

    if (!forceRefresh && authState.accessToken && authState.user) {
      return buildAuthReturnPayload()
    }

    if (!refreshRequest) {
      let diagnosticContext = null
      let restoreWarningLogged = false
      refreshRequest = (async () => {
        const transport = getRefreshTransport()
        diagnosticContext = buildRefreshDiagnosticContext(transport)
        const refreshed = transport === 'body'
          ? await runBodyRefreshRequest(diagnosticContext)
          : await runCookieRefreshRequest(diagnosticContext)

        if (!refreshed?.accessToken) {
          restoreWarningLogged = true
          logSessionRestoreWarning('refresh_unavailable', new Error('Session refresh is unavailable'), diagnosticContext)
          if (authState.accessToken || authState.user || forceRefresh) {
            throw new Error('Session refresh is unavailable')
          }
          return buildAuthReturnPayload()
        }

        if (
          transport === 'cookie'
          && defaultSessionTransport === 'body'
          && !authState.refreshToken
          && refreshed?.accessToken
        ) {
          await bootstrapBrowserSession(refreshed.accessToken, {
            remember: true,
            sessionTransport: 'body'
          })
        }

        return buildRefreshReturnPayload(refreshed)
      })()
        .catch((error) => {
          if (!restoreWarningLogged) {
            logSessionRestoreWarning('refresh_failed', error, diagnosticContext)
          }
          clearStoredAuth()
          throw error
        })
        .finally(() => {
          refreshRequest = null
        })
    }

    return refreshRequest
  }

  async function logout() {
    const csrfToken = getStoredCsrfToken()
    const refreshToken = typeof authState.refreshToken === 'string' && authState.refreshToken.trim()
      ? authState.refreshToken.trim()
      : ''
    const sessionTransport = getRefreshTransport()

    try {
      const headers = {}
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }
      if (sessionTransport === 'body' && refreshToken) {
        headers['X-Refresh-Token'] = refreshToken
      }

      await http.delete('/auth/session', {
        __skipAuthRefresh: true,
        data: sessionTransport === 'body' && refreshToken
          ? { refreshToken }
          : {},
        headers
      })
    } catch {
      // Local cleanup still wins if the session endpoint is unavailable.
    } finally {
      clearStoredAuth()
    }
  }

  function isAuthenticated() {
    return !!getStoredAccessToken()
  }

  function destroy() {
    destroyed = true
    clearProactiveSessionRefresh()
    authListeners.clear()
  }

  return { destroy, clearStoredAuth, getStoredAccessToken, getCurrentUser, subscribeToAuthState, storeAuthenticationResult, completeBrowserAuthentication, restoreBrowserSession, logout, isAuthenticated }
}

export { normalizeSessionTransport, redirectToLoginIfNeeded }
