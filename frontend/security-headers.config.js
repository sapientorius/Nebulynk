export function buildFrontendFrameAncestorsDirective() {
  return "frame-ancestors 'none'"
}

const LOCAL_BROWSER_HELPER_CONNECT_ORIGINS = Object.freeze([
  'ws://127.0.0.1:47641'
])

function asList(value) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function normalizeOrigin(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    return new URL(trimmed).origin
  } catch {
    return ''
  }
}

function toWebSocketOrigin(origin) {
  if (!origin) return ''

  try {
    const parsed = new URL(origin)
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:'
    if (parsed.protocol === 'http:') parsed.protocol = 'ws:'
    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      return parsed.origin
    }
  } catch {
    return ''
  }

  return ''
}

function appendUnique(target, values) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value)
    }
  }
}

export function resolveFrontendConnectSourceOrigins({
  apiOrigin = '',
  apiOrigins = [],
  livekitOrigin = '',
  livekitOrigins = [],
  includeLocalBrowserHelper = true
} = {}) {
  const connectSrc = ["'self'"]

  for (const value of [...asList(apiOrigin), ...asList(apiOrigins)]) {
    const origin = normalizeOrigin(value)
    appendUnique(connectSrc, [origin, toWebSocketOrigin(origin)])
  }

  for (const value of [...asList(livekitOrigin), ...asList(livekitOrigins)]) {
    appendUnique(connectSrc, [toWebSocketOrigin(normalizeOrigin(value))])
  }

  if (includeLocalBrowserHelper) {
    appendUnique(connectSrc, LOCAL_BROWSER_HELPER_CONNECT_ORIGINS)
  }

  return connectSrc
}

export function buildFrontendContentSecurityPolicy(options = {}) {
  const connectSrc = options.connectOrigins || resolveFrontendConnectSourceOrigins(options)

  return [
    "default-src 'self'",
    "base-uri 'self'",
    buildFrontendFrameAncestorsDirective(),
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src ${connectSrc.join(' ')}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:"
  ].join('; ')
}
