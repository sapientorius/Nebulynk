const keys = Object.freeze({
  apiUrl: ['API_URL', 'VITE_API_URL'],
  backendUrl: ['BACKEND_URL', 'VITE_BACKEND_URL'],
  livekitUrl: ['LIVEKIT_URL', 'VITE_LIVEKIT_URL'],
  vapidPublicKey: ['VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY'],
  authCsrfCookieName: ['AUTH_CSRF_COOKIE_NAME', 'VITE_AUTH_CSRF_COOKIE_NAME']
})

function validateUrl(value, name, protocols, relative = false) {
  if (!value) return
  if (/[\s\\]/u.test(value) || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error(`${name} contains invalid URL characters`)
  if (relative && value.startsWith('/') && !value.startsWith('//')) return
  if (!/^(https?|wss?):\/\//.test(value)) throw new Error(`${name} must be an absolute URL`)
  let url
  try { url = new URL(value) } catch { throw new Error(`${name} must be an absolute URL${relative ? ' or a root-relative path' : ''}`) }
  if (!protocols.includes(url.protocol) || url.username || url.password || /["'$;{}<>]/.test(url.hostname)) {
    throw new Error(`${name} has an unsupported protocol, credentials, or hostname`)
  }
}

export function resolveRuntimeConfig(env = process.env, { requireApi = true } = {}) {
  const config = Object.fromEntries(Object.entries(keys).map(([key, [name, alias]]) => {
    const value = Object.hasOwn(env, name) ? env[name] : env[alias]
    return [key, typeof value === 'string' ? value.trim() : '']
  }))
  if (requireApi && !config.apiUrl) throw new Error('API_URL (or VITE_API_URL) must be set')
  validateUrl(config.apiUrl, 'API_URL', ['http:', 'https:'], true)
  validateUrl(config.backendUrl, 'BACKEND_URL', ['http:', 'https:'])
  validateUrl(config.livekitUrl, 'LIVEKIT_URL', ['http:', 'https:', 'ws:', 'wss:'])
  config.authCsrfCookieName ||= 'nebulynk_csrf_token'
  if (!/^[A-Za-z0-9_-]+$/.test(config.authCsrfCookieName)) throw new Error('AUTH_CSRF_COOKIE_NAME is invalid')
  return config
}

export function serializeRuntimeConfig(config) {
  const json = JSON.stringify(config).replace(/[<\u2028\u2029]/g, (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `window.__NEBULYNK_CONFIG__ = Object.freeze(${json});\n`
}
