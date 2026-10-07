const environmentKeys = Object.freeze({
  apiUrl: 'VITE_API_URL',
  backendUrl: 'VITE_BACKEND_URL',
  livekitUrl: 'VITE_LIVEKIT_URL',
  vapidPublicKey: 'VITE_VAPID_PUBLIC_KEY',
  authCsrfCookieName: 'VITE_AUTH_CSRF_COOKIE_NAME'
})

// An explicitly empty runtime value disables a build-time value as well.
export function readFrontendConfig(key, {
  runtime = globalThis.window?.__NEBULYNK_CONFIG__,
  env = import.meta.env
} = {}) {
  const value = runtime && Object.hasOwn(runtime, key)
    ? runtime[key]
    : env?.[environmentKeys[key]]
  return typeof value === 'string' ? value.trim() : ''
}

export function readViteEnv(key) {
  const configKey = Object.keys(environmentKeys).find((name) => environmentKeys[name] === key)
  return configKey ? readFrontendConfig(configKey) : ''
}
