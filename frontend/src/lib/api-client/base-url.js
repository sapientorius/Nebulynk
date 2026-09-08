function readViteEnv(key) {
  if (typeof import.meta === 'undefined') return ''
  return import.meta.env?.[key]?.trim?.() || ''
}

const configuredApiUrl = readViteEnv('VITE_API_URL')

const DEFAULT_API_BASE_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, '')
  : '/api'

const LOCAL_DEV_SOCKET_HOSTS = new Set(['localhost', '127.0.0.1'])

const LOCAL_DEV_FRONTEND_PORTS = new Set(['5173', '4173', '1420'])

function normalizeApiBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string') return DEFAULT_API_BASE_URL
  const trimmed = baseUrl.trim()
  if (!trimmed) return DEFAULT_API_BASE_URL
  return trimmed.replace(/\/+$/, '')
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

export { readViteEnv, normalizeApiBaseUrl, resolveApiBaseUrlFromOptions, resolveApiBaseUrlShape }
