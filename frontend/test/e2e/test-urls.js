function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\/+$/, '')
}

export const backendPort = process.env.E2E_BACKEND_PORT || '3031'
export const frontendPort = process.env.E2E_FRONTEND_PORT || '4173'
export const defaultBackendUrl = `http://127.0.0.1:${backendPort}`
export const defaultFrontendUrl = `http://127.0.0.1:${frontendPort}`

export const useExternalServers = process.env.E2E_EXTERNAL_SERVERS === 'true'
export const backendUrl = useExternalServers
  ? (normalizeBaseUrl(process.env.E2E_BACKEND_URL) || defaultBackendUrl)
  : defaultBackendUrl
export const frontendUrl = useExternalServers
  ? (normalizeBaseUrl(process.env.E2E_FRONTEND_URL) || defaultFrontendUrl)
  : defaultFrontendUrl

export const shouldUsePreviewFrontend = process.env.E2E_USE_PREVIEW_FRONTEND === 'true'
  || process.argv.some((arg) => /browser-security\.spec\.js$/i.test(String(arg || '')))

export function resolveBackendUrl(path = '/') {
  const normalizedPath = String(path || '/').replace(/^\/+/, '')
  return new URL(normalizedPath, `${backendUrl}/`).toString()
}

export function resolveFrontendUrl(path = '/') {
  const normalizedPath = String(path || '/').replace(/^\/+/, '')
  return new URL(normalizedPath, `${frontendUrl}/`).toString()
}
