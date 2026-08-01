export const DEFAULT_AUTHENTICATION_SECRET = 'change-me-in-production'
const DEFAULT_FRONTEND_URL = 'http://localhost:5173'
const DEFAULT_DESKTOP_FRONTEND_ORIGINS = [
  'http://127.0.0.1:1420',
  'http://localhost:1420',
  'http://127.0.0.1:5173',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'tauri://localhost'
]
const DEFAULT_POSTGRES_PASSWORD = 'nebulynk_dev_password'
const DEFAULT_STORAGE_S3_ACCESS_KEY = 'nebulynk'
const DEFAULT_STORAGE_S3_SECRET_KEY = 'nebulynk_dev_password'
const DEFAULT_STORAGE_S3_BUCKET = 'nebulynk-files'
const DEFAULT_STORAGE_S3_ENDPOINT = 'http://127.0.0.1:3900'
const DEFAULT_STORAGE_S3_REGION = 'us-east-1'
const DEFAULT_LIVEKIT_API_KEY = 'qccdazotxntstqizhlqgkcdflfpkndao'
const DEFAULT_LIVEKIT_API_SECRET = 'qccdazotxntstqizhlqgkcdflfpkndao'
const DEFAULT_LIVEKIT_HOST = 'http://localhost:7880'
export const DEFAULT_AI_SECRET_FALLBACK = 'nebulynk-ai-secret-dev-fallback'
export const LEGACY_DEFAULT_AI_SECRET_FALLBACK = 'nebulynk-ai-secret-fallback'

const UNSAFE_AUTH_SECRETS = new Set([
  '',
  DEFAULT_AUTHENTICATION_SECRET,
  'PRODUCTION_JWT_SECRET',
  'change_me'
])

const UNSAFE_SHARED_SECRETS = new Set([
  '',
  'change_me',
  'change_me_livekit_secret',
  DEFAULT_POSTGRES_PASSWORD,
  DEFAULT_STORAGE_S3_SECRET_KEY,
  DEFAULT_LIVEKIT_API_SECRET
])

function normalizeEnvString(value) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function parseOriginList(value) {
  const normalized = normalizeEnvString(value)
  if (!normalized) return []

  return normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isHttpsUrl(value) {
  return /^https:\/\//i.test(value)
}

function isLikelyAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

function tryParseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isLikelyLegacyMinioConsoleEndpoint(value) {
  const parsed = tryParseUrl(value)
  if (!parsed) return false
  return parsed.port === '9001'
}

function resolveStoragePublicEndpoint(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_PUBLIC_ENDPOINT)
    || normalizeEnvString(env.MINIO_PUBLIC_ENDPOINT)
}

function buildSecurityItem(code, message) {
  return { code, message }
}

export function isProductionEnvironment(env = process.env) {
  return normalizeEnvString(env.NODE_ENV).toLowerCase() === 'production'
}

export function shouldTrustProxy(env = process.env) {
  const configured = normalizeEnvString(env.TRUST_PROXY).toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(configured)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(configured)) {
    return false
  }

  return false
}

export function resolveAuthenticationSecret(env = process.env, configuredSecret = '') {
  return normalizeEnvString(env.JWT_SECRET)
    || normalizeEnvString(env.AUTHENTICATION_SECRET)
    || normalizeEnvString(configuredSecret)
    || DEFAULT_AUTHENTICATION_SECRET
}

export function resolveFrontendOrigins(env = process.env) {
  const origins = parseOriginList(env.FRONTEND_URL)
  if (origins.length > 0) {
    return origins
  }

  return [DEFAULT_FRONTEND_URL]
}

export function resolveDesktopFrontendOrigins(env = process.env) {
  const configuredOrigins = parseOriginList(env.DESKTOP_FRONTEND_URLS)
  return Array.from(new Set([
    ...DEFAULT_DESKTOP_FRONTEND_ORIGINS,
    ...configuredOrigins
  ]))
}

export function resolveClientOrigins(env = process.env) {
  return Array.from(new Set([
    ...resolveFrontendOrigins(env),
    ...resolveDesktopFrontendOrigins(env)
  ]))
}

export function resolveFrontendUrl(env = process.env) {
  return resolveFrontendOrigins(env)[0] || DEFAULT_FRONTEND_URL
}

export function resolvePasskeyRpId(env = process.env) {
  const configured = normalizeEnvString(env.PASSKEY_RP_ID)
  if (configured) {
    return configured
  }

  const frontendUrl = resolveFrontendUrl(env)
  const parsed = tryParseUrl(frontendUrl)
  return parsed?.hostname || 'localhost'
}

export function resolveCorsOrigin(requestOrigin, allowedOrigins = []) {
  const normalizedRequestOrigin = normalizeEnvString(requestOrigin)
  if (!normalizedRequestOrigin) {
    return allowedOrigins[0] || DEFAULT_FRONTEND_URL
  }

  return allowedOrigins.includes(normalizedRequestOrigin) ? normalizedRequestOrigin : ''
}

export function resolveStorageS3Endpoint(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_ENDPOINT)
    || normalizeEnvString(env.MINIO_ENDPOINT)
    || DEFAULT_STORAGE_S3_ENDPOINT
}

export function resolveStorageS3PublicEndpoint(env = process.env) {
  return resolveStoragePublicEndpoint(env)
}

export function resolveStorageS3AccessKey(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_ACCESS_KEY)
    || normalizeEnvString(env.MINIO_ACCESS_KEY)
    || normalizeEnvString(env.MINIO_ROOT_USER)
    || DEFAULT_STORAGE_S3_ACCESS_KEY
}

export function resolveStorageS3SecretKey(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_SECRET_KEY)
    || normalizeEnvString(env.MINIO_SECRET_KEY)
    || normalizeEnvString(env.MINIO_ROOT_PASSWORD)
    || DEFAULT_STORAGE_S3_SECRET_KEY
}

export function resolveStorageBucket(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_BUCKET)
    || normalizeEnvString(env.MINIO_BUCKET)
    || DEFAULT_STORAGE_S3_BUCKET
}

export function resolveStorageS3Region(env = process.env) {
  return normalizeEnvString(env.STORAGE_S3_REGION)
    || normalizeEnvString(env.MEETING_RECORDINGS_S3_REGION)
    || DEFAULT_STORAGE_S3_REGION
}

export function resolveMinioAccessKey(env = process.env) {
  return resolveStorageS3AccessKey(env)
}

export function resolveMinioSecretKey(env = process.env) {
  return resolveStorageS3SecretKey(env)
}

export function resolveLivekitApiKey(env = process.env) {
  return normalizeEnvString(env.LIVEKIT_API_KEY) || DEFAULT_LIVEKIT_API_KEY
}

export function resolveLivekitApiSecret(env = process.env) {
  return normalizeEnvString(env.LIVEKIT_API_SECRET) || DEFAULT_LIVEKIT_API_SECRET
}

export function resolveLivekitHost(env = process.env) {
  return normalizeEnvString(env.LIVEKIT_HOST) || DEFAULT_LIVEKIT_HOST
}

export function resolveAiSecretFallback(env = process.env, authenticationSecret = '') {
  return normalizeEnvString(env.AI_SECRET_KEY)
    || normalizeEnvString(authenticationSecret)
    || (isProductionEnvironment(env) ? '' : DEFAULT_AI_SECRET_FALLBACK)
}

export function validateRuntimeSecurity({
  env = process.env,
  authenticationSecret = ''
} = {}) {
  const errors = []
  const warnings = []
  const frontendOrigins = resolveFrontendOrigins(env)
  const frontendUrlConfigured = normalizeEnvString(env.FRONTEND_URL)
  const passkeyRpIdConfigured = normalizeEnvString(env.PASSKEY_RP_ID)

  if (!isProductionEnvironment(env)) {
    return { errors, warnings, frontendOrigins }
  }

  if (UNSAFE_AUTH_SECRETS.has(normalizeEnvString(authenticationSecret))) {
    errors.push(buildSecurityItem(
      'auth-secret-unsafe',
      'JWT secret is missing or still uses a development placeholder.'
    ))
  }

  if (UNSAFE_SHARED_SECRETS.has(normalizeEnvString(env.POSTGRES_PASSWORD))) {
    errors.push(buildSecurityItem(
      'postgres-password-unsafe',
      'POSTGRES_PASSWORD is missing or still uses a development placeholder.'
    ))
  }

  if (UNSAFE_SHARED_SECRETS.has(resolveStorageS3SecretKey(env))) {
    errors.push(buildSecurityItem(
      'storage-s3-secret-unsafe',
      'S3 storage secret is missing or still uses a development placeholder.'
    ))
  }

  if (UNSAFE_SHARED_SECRETS.has(resolveLivekitApiSecret(env))) {
    errors.push(buildSecurityItem(
      'livekit-secret-unsafe',
      'LIVEKIT_API_SECRET is missing or still uses a development placeholder.'
    ))
  }

  if (!frontendUrlConfigured) {
    errors.push(buildSecurityItem(
      'frontend-url-missing',
      'FRONTEND_URL must be configured explicitly in production.'
    ))
  }

  for (const origin of frontendOrigins) {
    if (!isLikelyAbsoluteHttpUrl(origin)) {
      errors.push(buildSecurityItem(
        'frontend-url-invalid',
        `FRONTEND_URL entry "${origin}" must be an absolute http(s) URL.`
      ))
      continue
    }

    if (!isHttpsUrl(origin)) {
      warnings.push(buildSecurityItem(
        'frontend-url-not-https',
        `FRONTEND_URL entry "${origin}" is not https. Public deployments should terminate TLS before exposing the app.`
      ))
    }
  }

  if (!passkeyRpIdConfigured) {
    warnings.push(buildSecurityItem(
      'passkey-rp-id-missing',
      'PASSKEY_RP_ID is not configured. Passkey support will fall back to the first FRONTEND_URL host and may be incorrect for multi-origin deployments.'
    ))
  }

  if (passkeyRpIdConfigured) {
    const mismatchedOrigins = frontendOrigins.filter((origin) => {
      const parsed = tryParseUrl(origin)
      if (!parsed?.hostname) {
        return false
      }
      return parsed.hostname !== passkeyRpIdConfigured && !parsed.hostname.endsWith(`.${passkeyRpIdConfigured}`)
    })

    if (mismatchedOrigins.length > 0) {
      warnings.push(buildSecurityItem(
        'passkey-origin-rp-mismatch',
        `One or more FRONTEND_URL origins do not match PASSKEY_RP_ID "${passkeyRpIdConfigured}". Passkey registration and login may fail on those origins.`
      ))
    }
  }

  if (!normalizeEnvString(env.AI_SECRET_KEY)) {
    warnings.push(buildSecurityItem(
      'ai-secret-missing',
      'AI_SECRET_KEY is not configured. AI provider secrets will fall back to the authentication secret.'
    ))
  }

  if (!normalizeEnvString(env.LIVEKIT_PUBLIC_URL)) {
    warnings.push(buildSecurityItem(
      'livekit-public-url-missing',
      'LIVEKIT_PUBLIC_URL is not configured. Public deployments should publish an explicit client-facing LiveKit URL.'
    ))
  }

  const storagePublicEndpoint = resolveStoragePublicEndpoint(env)
  if (!storagePublicEndpoint) {
    warnings.push(buildSecurityItem(
      'storage-s3-public-endpoint-missing',
      'STORAGE_S3_PUBLIC_ENDPOINT is not configured. Signed file URLs should point at an explicit public S3 endpoint in production.'
    ))
  } else if (isLikelyLegacyMinioConsoleEndpoint(storagePublicEndpoint)) {
    errors.push(buildSecurityItem(
      'storage-s3-public-endpoint-console-port',
      'The configured public S3 endpoint points to port 9001, which is the legacy MinIO console port in the previous Nebulynk topology. Signed file URLs must use the S3 API/public asset endpoint instead.'
    ))
  }

  if (!normalizeEnvString(env.VAPID_PUBLIC_KEY) || !normalizeEnvString(env.VAPID_PRIVATE_KEY)) {
    warnings.push(buildSecurityItem(
      'vapid-keys-missing',
      'VAPID keys are not fully configured. Web push should stay disabled until both keys are present.'
    ))
  }

  return { errors, warnings, frontendOrigins }
}

export function getApiSecurityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  }
}
