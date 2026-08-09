import axios from 'axios'
import { normalizeMeetingVideoPreferences } from './meeting-video-preferences.js'

function readViteEnv(key) {
  if (typeof import.meta === 'undefined') return ''
  return import.meta.env?.[key]?.trim?.() || ''
}

const configuredApiUrl = readViteEnv('VITE_API_URL')
const configuredCsrfCookieName = readViteEnv('VITE_AUTH_CSRF_COOKIE_NAME')

const DEFAULT_API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, '')
  : '/api'

const DEFAULT_CSRF_COOKIE_NAME = configuredCsrfCookieName || 'nebulynk_csrf_token'
const DEFAULT_CSRF_STORAGE_KEY = `${DEFAULT_CSRF_COOKIE_NAME}:client`
const DEFAULT_PROACTIVE_REFRESH_LEEWAY_MS = 60_000
const PLATFORM_STATUS_CACHE = new Map()
const SESSION_ROUTE_PATTERN = /\/auth\/session(?:\/bootstrap|\/refresh)?$/
const AUTHENTICATION_ROUTE_PATTERN = /\/authentication$/
const LOCAL_DEV_SOCKET_HOSTS = new Set(['localhost', '127.0.0.1'])
const LOCAL_DEV_FRONTEND_PORTS = new Set(['5173', '4173', '1420'])

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

function normalizeApiBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return DEFAULT_API_BASE_URL
  const trimmed = baseUrl.trim()
  if (!trimmed) return DEFAULT_API_BASE_URL
  return trimmed.replace(/\/+$/, '')
}

function getPlatformStatusCacheEntry(baseUrl) {
  const cacheKey = normalizeApiBaseUrl(baseUrl)
  let entry = PLATFORM_STATUS_CACHE.get(cacheKey)
  if (!entry) {
    entry = {
      value: null,
      loaded: false,
      promise: null
    }
    PLATFORM_STATUS_CACHE.set(cacheKey, entry)
  }
  return entry
}

function setCachedPlatformStatus(baseUrl, value) {
  const entry = getPlatformStatusCacheEntry(baseUrl)
  entry.value = value || {}
  entry.loaded = true
  entry.promise = null
  return entry.value
}

function clearCachedPlatformStatus(baseUrl) {
  const entry = getPlatformStatusCacheEntry(baseUrl)
  entry.promise = null
  entry.loaded = false
  entry.value = null
}

function normalizeSessionTransport(value) {
  return value === 'body' ? 'body' : 'cookie'
}

function resolveApiBaseUrlFromOptions(options = {}) {
  const dynamicBaseUrl = typeof options.getBaseUrl === 'function'
    ? options.getBaseUrl()
    : options.baseUrl

  return normalizeApiBaseUrl(dynamicBaseUrl || DEFAULT_API_BASE_URL)
}

function resolveApiBaseUrlShape(baseUrl) {
  const normalized = normalizeApiBaseUrl(baseUrl)
  if (!/^https?:\/\//i.test(normalized)) {
    return {
      kind: 'relative',
      usesApiPrefix: normalized === '/api' || normalized.startsWith('/api/')
    }
  }

  try {
    const parsed = new URL(normalized)
    const currentOrigin = typeof window !== 'undefined' ? window.location?.origin || '' : ''
    return {
      kind: 'absolute',
      origin: parsed.origin,
      sameOrigin: Boolean(currentOrigin && parsed.origin === currentOrigin),
      endsWithApi: normalized.endsWith('/api')
    }
  } catch {
    return {
      kind: 'absolute',
      origin: null,
      sameOrigin: false,
      endsWithApi: normalized.endsWith('/api')
    }
  }
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

function isFormDataPayload(data) {
if (!data || typeof FormData === 'undefined') return false
return data instanceof FormData
}

function deleteHeader(headers, headerName) {
if (!headers || !headerName) return
if (typeof headers.delete === 'function') {
headers.delete(headerName)
return
}

const normalizedHeaderName = headerName.toLowerCase()
for (const key of Object.keys(headers)) {
if (key.toLowerCase() === normalizedHeaderName) {
delete headers[key]
}
}
}

function shouldSkipRefreshRetry(config = {}) {
const url = String(config.url || '')
return config.__skipAuthRefresh === true
    || AUTHENTICATION_ROUTE_PATTERN.test(url)
    || SESSION_ROUTE_PATTERN.test(url)
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

    if (typeof Buffer !== 'undefined') {
      const text = Buffer.from(normalized, 'base64').toString('utf8')
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

export function createApiClient(options = {}) {
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

  const http = axios.create({
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  })

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

  function getBaseUrl() {
    return resolveApiBaseUrlFromOptions(options)
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

  function resolveApiUrl(path = '') {
    const apiBaseUrl = getBaseUrl()
    if (!path) return apiBaseUrl
    if (/^https?:\/\//i.test(path)) return path

    if (path.startsWith('/api/')) {
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return `${apiBaseUrl}${path.slice(4)}`
      }
      return path
    }

    if (path === '/api') {
      return apiBaseUrl
    }

    if (path.startsWith('/')) {
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return `${apiBaseUrl}${path}`
      }
      return `${apiBaseUrl}${path}`
    }

    return `${apiBaseUrl}/${path}`
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

  http.interceptors.request.use((config) => {
    const token = getStoredAccessToken()
    if (token) {
      config.headers = config.headers || {}
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    if (isFormDataPayload(config.data)) {
      config.headers = config.headers || {}
      deleteHeader(config.headers, 'Content-Type')
    }
    config.withCredentials = true
    config.baseURL = getBaseUrl()
    return config
  })

  http.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error?.config || null
      const status = error?.response?.status

      if (status !== 401 || !config || shouldSkipRefreshRetry(config) || config.__authRetryAttempted) {
        return Promise.reject(error)
      }

      if (!getStoredAccessToken()) {
        clearStoredAuth()
        if (options.redirectOnAuthFailure !== false) {
          redirectToLoginIfNeeded()
        }
        return Promise.reject(error)
      }

      config.__authRetryAttempted = true

      try {
        const refreshed = await restoreBrowserSession({ forceRefresh: true })
        if (!refreshed?.accessToken) {
          throw error
        }

        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${refreshed.accessToken}`
        return http(config)
      } catch {
        clearStoredAuth()
        if (options.redirectOnAuthFailure !== false) {
          redirectToLoginIfNeeded()
        }
        return Promise.reject(error)
      }
    }
  )

  async function getPlatformStatus({ refresh = false } = {}) {
    const baseUrl = getBaseUrl()
    const cacheEntry = getPlatformStatusCacheEntry(baseUrl)

    if (!refresh && cacheEntry.loaded) {
      return cacheEntry.value
    }

    if (cacheEntry.promise) {
      return cacheEntry.promise
    }

    cacheEntry.promise = http.get('/platform')
      .then(({ data }) => setCachedPlatformStatus(baseUrl, data))
      .catch((error) => {
        cacheEntry.promise = null
        throw error
      })

    return cacheEntry.promise
  }

  async function setupPlatform(payload) {
    const { data } = await http.post('/platform', payload)
    return setCachedPlatformStatus(getBaseUrl(), data)
  }

  async function updatePlatformSettings(payload) {
    const baseUrl = getBaseUrl()
    try {
      const { data } = await http.patch('/platform', payload)
      return setCachedPlatformStatus(baseUrl, data)
    } catch (error) {
      clearCachedPlatformStatus(baseUrl)
      throw error
    }
  }

  async function getSelfRegistrationConfig() {
    const { data } = await http.get('/self-registration', {
      __skipAuthRefresh: true
    })
    return data
  }

  async function createSelfRegistration(payload) {
    const { data } = await http.post('/self-registration', payload, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function confirmSelfRegistration(token) {
    const { data } = await http.patch(`/self-registration/${encodeURIComponent(token)}`, {}, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function getRegistrationSettings() {
    const { data } = await http.get('/registration-settings')
    return data
  }

  async function updateRegistrationSettings(payload) {
    const { data } = await http.patch('/registration-settings/default', payload)
    return data
  }

  async function listPendingRegistrations() {
    const { data } = await http.get('/pending-registrations')
    return data
  }

  async function confirmPendingRegistration(id) {
    const { data } = await http.patch(`/pending-registrations/${encodeURIComponent(id)}`, {
      action: 'confirm'
    })
    return data
  }

  async function deletePendingRegistration(id) {
    const { data } = await http.delete(`/pending-registrations/${encodeURIComponent(id)}`)
    return data
  }

  async function getSecuritySettings() {
    const { data } = await http.get('/security-settings')
    return data
  }

  async function updateSecuritySettings(payload) {
    const { data } = await http.patch('/security-settings/default', payload)
    return data
  }

  async function getSmtpSettings() {
    const { data } = await http.get('/smtp-settings')
    return data
  }

  async function updateSmtpSettings(payload) {
    const { data } = await http.patch('/smtp-settings', payload)
    return data
  }

  async function testSmtpConnection() {
    const { data } = await http.post('/smtp-settings', {
      action: 'test_connection'
    })
    return data
  }

  async function sendSmtpTestEmail(payload = {}) {
    const { data } = await http.post('/smtp-settings', {
      action: 'send_test_email',
      ...payload
    })
    return data
  }

  async function listAiProviderInstances() {
    const { data } = await http.get('/ai-provider-instances')
    return data
  }

  async function createAiProviderInstance(payload) {
    const { data } = await http.post('/ai-provider-instances', payload)
    return data
  }

  async function updateAiProviderInstance(id, payload) {
    const { data } = await http.patch(`/ai-provider-instances/${id}`, payload)
    return data
  }

  async function deleteAiProviderInstance(id) {
    const { data } = await http.delete(`/ai-provider-instances/${id}`)
    return data
  }

  async function listAiFunctionConfigs() {
    const { data } = await http.get('/ai-function-configs')
    return data
  }

  async function updateAiFunctionConfig(functionKey, payload) {
    const { data } = await http.patch(`/ai-function-configs/${functionKey}`, payload)
    return data
  }

  async function listAiProviderModels(providerInstanceId, capability, { refresh = false } = {}) {
    const { data } = await http.get('/ai-provider-models', {
      params: {
        provider_instance_id: providerInstanceId,
        capability,
        refresh
      }
    })
    return data
  }

  async function login(email, password, {
    remember = true,
    sessionTransport = defaultSessionTransport
  } = {}) {
    const { data } = await http.post('/auth/login', {
      email,
      password,
      remember
    }, {
      __skipAuthRefresh: true
    })

    if (data?.requiresTwoFactor) {
      return data
    }

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function verifyTwoFactorLogin({
    challengeId,
    method = 'totp',
    code,
    remember = true,
    sessionTransport = defaultSessionTransport
  }) {
    const { data } = await http.post('/auth/login/verify-2fa', {
      challengeId,
      method,
      code
    }, {
      __skipAuthRefresh: true
    })

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function beginPasskeyAuthentication({ remember = true } = {}) {
    const { data } = await http.post('/auth/passkeys/authentication-options', {
      remember
    }, {
      __skipAuthRefresh: true
    })

    return data
  }

  async function verifyPasskeyAuthentication({
    challengeId,
    authenticationResponse,
    remember = true,
    sessionTransport = defaultSessionTransport
  }) {
    const { data } = await http.post('/auth/passkeys/verify-authentication', {
      challengeId,
      authenticationResponse
    }, {
      __skipAuthRefresh: true
    })

    return completeBrowserAuthentication(data, { remember, sessionTransport })
  }

  async function requestPasswordReset(email) {
    const { data } = await http.post('/password-reset', {
      email
    }, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function validatePasswordResetToken(token) {
    const { data } = await http.get('/password-reset', {
      __skipAuthRefresh: true,
      params: {
        token
      }
    })
    return data
  }

  async function resetPassword(token, password) {
    const { data } = await http.patch(`/password-reset/${encodeURIComponent(token)}`, {
      password
    }, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function changePassword({ currentPassword, newPassword }) {
    const { data } = await http.post('/password-change', {
      current_password: currentPassword,
      new_password: newPassword
    })
    return data
  }

  async function getTwoFactorStatus() {
    const { data } = await http.get('/users/me/2fa')
    return data
  }

  async function beginTwoFactorSetup() {
    const { data } = await http.post('/users/me/2fa/setup', {})
    return data
  }

  async function confirmTwoFactorSetup({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/confirm', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function regenerateTwoFactorRecoveryCodes({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/recovery-codes/regenerate', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function disableTwoFactor({ currentPassword, code }) {
    const { data } = await http.post('/users/me/2fa/disable', {
      current_password: currentPassword,
      code
    })
    return data
  }

  async function resetUserTwoFactor(userId) {
    const { data } = await http.post(`/users/${encodeURIComponent(userId)}/2fa/reset`, {})
    return data
  }

  async function getPasskeys() {
    const { data } = await http.get('/users/me/passkeys')
    return data
  }

  async function beginPasskeyRegistration({ currentPassword }) {
    const { data } = await http.post('/users/me/passkeys/registration-options', {
      current_password: currentPassword
    })
    return data
  }

  async function verifyPasskeyRegistration({ challengeId, registrationResponse, name = null }) {
    const { data } = await http.post('/users/me/passkeys/verify-registration', {
      challengeId,
      registrationResponse,
      name
    })
    return data
  }

  async function deletePasskey(passkeyId, { currentPassword }) {
    const { data } = await http.post(`/users/me/passkeys/${encodeURIComponent(passkeyId)}/delete`, {
      current_password: currentPassword
    })
    return data
  }

  async function resetUserPasskeys(userId) {
    const { data } = await http.post(`/users/${encodeURIComponent(userId)}/passkeys/reset`, {})
    return data
  }

  async function beginPrimaryAdminTransferPasskeyOptions() {
    const { data } = await http.post('/admin/primary-admin-transfer/passkey-options', {})
    return data
  }

  async function transferPrimaryAdmin({ targetUserId, confirmation, reauth }) {
    const { data } = await http.post('/admin/primary-admin-transfer', {
      target_user_id: targetUserId,
      confirmation,
      reauth
    })
    return data
  }

  function isAuthenticated() {
    return !!getStoredAccessToken()
  }

  function destroy() {
    destroyed = true
    clearProactiveSessionRefresh()
    authListeners.clear()
  }

  return {
    http,
    getBaseUrl,
    resolveApiUrl,
    destroy,
    clearStoredAuth,
    getStoredAccessToken,
    getCurrentUser,
    subscribeToAuthState,
    storeAuthenticationResult,
    completeBrowserAuthentication,
    restoreBrowserSession,
    logout,
    getPlatformStatus,
    setupPlatform,
    updatePlatformSettings,
    getSelfRegistrationConfig,
    createSelfRegistration,
    confirmSelfRegistration,
    getRegistrationSettings,
    updateRegistrationSettings,
    listPendingRegistrations,
    confirmPendingRegistration,
    deletePendingRegistration,
    getSecuritySettings,
    updateSecuritySettings,
    getSmtpSettings,
    updateSmtpSettings,
    testSmtpConnection,
    sendSmtpTestEmail,
    listAiProviderInstances,
    createAiProviderInstance,
    updateAiProviderInstance,
    deleteAiProviderInstance,
    listAiFunctionConfigs,
    updateAiFunctionConfig,
    listAiProviderModels,
    login,
    verifyTwoFactorLogin,
    beginPasskeyAuthentication,
    verifyPasskeyAuthentication,
    requestPasswordReset,
    validatePasswordResetToken,
    resetPassword,
    changePassword,
    getTwoFactorStatus,
    beginTwoFactorSetup,
    confirmTwoFactorSetup,
    regenerateTwoFactorRecoveryCodes,
    disableTwoFactor,
    resetUserTwoFactor,
    getPasskeys,
    beginPasskeyRegistration,
    verifyPasskeyRegistration,
    deletePasskey,
    resetUserPasskeys,
    beginPrimaryAdminTransferPasskeyOptions,
    transferPrimaryAdmin,
    isAuthenticated
  }
}

export function resolveSocketBaseUrl(apiBaseUrl, {
  backendBaseUrl = '',
  targetWindow = typeof window !== 'undefined' ? window : null
} = {}) {
  const normalized = normalizeApiBaseUrl(apiBaseUrl)
  if (/^https?:\/\//i.test(normalized)) {
    return normalized.endsWith('/api')
      ? normalized.slice(0, -4)
      : normalized
  }

  if (normalized === '/api' && targetWindow) {
    const explicitBackendUrl = normalizeApiBaseUrl(backendBaseUrl)
    if (/^https?:\/\//i.test(explicitBackendUrl)) {
      return explicitBackendUrl.endsWith('/api')
        ? explicitBackendUrl.slice(0, -4)
        : explicitBackendUrl
    }

    try {
      const currentOrigin = new URL(targetWindow.location.origin)
      if (
        LOCAL_DEV_SOCKET_HOSTS.has(currentOrigin.hostname)
        && LOCAL_DEV_FRONTEND_PORTS.has(currentOrigin.port)
      ) {
        return `${currentOrigin.protocol}//${currentOrigin.hostname}:3030`
      }
    } catch {
      // Fall back to same-origin sockets when the runtime origin is unavailable.
    }

    return targetWindow.location.origin
  }

  return normalized.endsWith('/api')
    ? normalized.slice(0, -4)
    : normalized
}
