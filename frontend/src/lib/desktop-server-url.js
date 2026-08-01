const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1'])
const LOCAL_FRONTEND_DEV_PORTS = new Set(['5173', '1420'])
const LOCAL_BACKEND_DEV_PORTS = new Set(['3030'])

function normalizeUrlInput(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\/+$/, '')
}

function tryParseAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function normalizePathname(pathname = '/') {
  const normalized = String(pathname || '/').replace(/\/+$/, '')
  return normalized || '/'
}

function joinUrlPath(basePathname = '/', route = '/') {
  const normalizedBasePath = normalizePathname(basePathname)
  const normalizedRoute = String(route || '/').trim() || '/'
  const relativeRoute = normalizedRoute.replace(/^\/+/, '')

  if (!relativeRoute) {
    return normalizedBasePath === '/' ? '/' : normalizedBasePath
  }

  if (normalizedBasePath === '/') {
    return `/${relativeRoute}`
  }

  return `${normalizedBasePath}/${relativeRoute}`.replace(/\/{2,}/g, '/')
}

function parseRouteTarget(route = '/') {
  try {
    const parsed = new URL(String(route || '/'), 'https://desktop.invalid')
    return {
      pathname: parsed.pathname || '/',
      search: parsed.search || '',
      hash: parsed.hash || ''
    }
  } catch {
    return {
      pathname: '/',
      search: '',
      hash: ''
    }
  }
}

function isLocalDevFrontendOrigin(parsedUrl) {
  return LOCAL_DEV_HOSTS.has(parsedUrl.hostname) && LOCAL_FRONTEND_DEV_PORTS.has(parsedUrl.port)
}

function isLocalDevBackendOrigin(parsedUrl) {
  return LOCAL_DEV_HOSTS.has(parsedUrl.hostname) && LOCAL_BACKEND_DEV_PORTS.has(parsedUrl.port)
}

export function resolveDesktopApiBaseUrl(baseUrl) {
  const normalizedInput = normalizeUrlInput(baseUrl)
  if (!normalizedInput) return ''

  const absoluteUrl = tryParseAbsoluteHttpUrl(normalizedInput)
  if (!absoluteUrl) {
    return normalizedInput
  }

  const pathname = normalizePathname(absoluteUrl.pathname)
  const origin = absoluteUrl.origin

  if (pathname === '/api' || pathname.endsWith('/api')) {
    return `${origin}${pathname}`
  }

  if (pathname === '/' && isLocalDevFrontendOrigin(absoluteUrl)) {
    return `${absoluteUrl.protocol}//${absoluteUrl.hostname}:3030`
  }

  if (pathname === '/' && isLocalDevBackendOrigin(absoluteUrl)) {
    return origin
  }

  const basePath = pathname === '/' ? '' : pathname
  return `${origin}${basePath}/api`
}

export function resolveDesktopAppUrl(baseUrl, route = '/') {
  const normalizedInput = normalizeUrlInput(baseUrl)
  if (!normalizedInput) return ''

  const absoluteUrl = tryParseAbsoluteHttpUrl(normalizedInput)
  if (!absoluteUrl) {
    return normalizedInput
  }

  const basePathname = normalizePathname(absoluteUrl.pathname)
  const routeTarget = parseRouteTarget(route)
  const targetPathname = joinUrlPath(basePathname, routeTarget.pathname)
  const targetUrl = new URL(absoluteUrl.toString())
  targetUrl.pathname = targetPathname
  targetUrl.search = routeTarget.search
  targetUrl.hash = routeTarget.hash
  return targetUrl.toString().replace(/\/$/, targetPathname === '/' ? '/' : '')
}
