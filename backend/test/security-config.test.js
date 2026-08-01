import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  resolveClientOrigins,
  resolveAuthenticationSecret,
  resolveCorsOrigin,
  resolveDesktopFrontendOrigins,
  resolveFrontendOrigins,
  resolveFrontendUrl,
  resolvePasskeyRpId,
  resolveMinioSecretKey,
  resolveStorageBucket,
  resolveStorageS3AccessKey,
  resolveStorageS3Endpoint,
  resolveStorageS3PublicEndpoint,
  resolveStorageS3SecretKey,
  validateRuntimeSecurity
} from '../src/lib/security-config.js'

test('resolveAuthenticationSecret prefers JWT_SECRET from the environment', () => {
  const value = resolveAuthenticationSecret({
    JWT_SECRET: 'env-jwt-secret',
    AUTHENTICATION_SECRET: 'env-auth-secret'
  }, 'configured-secret')

  assert.equal(value, 'env-jwt-secret')
})

test('resolveFrontendOrigins supports comma-separated origin lists', () => {
  const origins = resolveFrontendOrigins({
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://chat.example.com, https://admin.example.com '
  })

  assert.deepEqual(origins, ['https://chat.example.com', 'https://admin.example.com'])
  assert.equal(resolveFrontendUrl({ FRONTEND_URL: 'https://chat.example.com,https://admin.example.com' }), 'https://chat.example.com')
})

test('resolveDesktopFrontendOrigins includes desktop dev and Tauri production origins', () => {
  const origins = resolveDesktopFrontendOrigins({
    NODE_ENV: 'development'
  })

  assert.ok(origins.includes('http://127.0.0.1:1420'))
  assert.ok(origins.includes('http://localhost:1420'))
  assert.ok(origins.includes('https://tauri.localhost'))
  assert.ok(origins.includes('tauri://localhost'))
})

test('resolveClientOrigins merges web and desktop origin allowlists without changing passkey web origins', () => {
  const env = {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://chat.example.com',
    DESKTOP_FRONTEND_URLS: 'https://desktop.example.com'
  }

  const origins = resolveClientOrigins(env)

  assert.ok(origins.includes('https://chat.example.com'))
  assert.ok(origins.includes('https://desktop.example.com'))
  assert.ok(origins.includes('https://tauri.localhost'))
  assert.deepEqual(resolveFrontendOrigins(env), ['https://chat.example.com'])
})

test('resolvePasskeyRpId prefers explicit config and otherwise falls back to the first frontend host', () => {
  assert.equal(resolvePasskeyRpId({
    PASSKEY_RP_ID: 'example.com',
    FRONTEND_URL: 'https://chat.example.com'
  }), 'example.com')

  assert.equal(resolvePasskeyRpId({
    FRONTEND_URL: 'https://chat.example.com'
  }), 'chat.example.com')
})

test('resolveCorsOrigin only reflects explicitly allowed origins', () => {
  const allowedOrigins = ['https://chat.example.com', 'https://admin.example.com']

  assert.equal(resolveCorsOrigin('https://chat.example.com', allowedOrigins), 'https://chat.example.com')
  assert.equal(resolveCorsOrigin('https://evil.example.com', allowedOrigins), '')
})

test('resolveMinioSecretKey falls back to MINIO_ROOT_PASSWORD when needed', () => {
  assert.equal(resolveMinioSecretKey({ MINIO_ROOT_PASSWORD: 'minio-root-secret' }), 'minio-root-secret')
})

test('S3 storage resolvers prefer generic STORAGE_S3 variables', () => {
  const env = {
    STORAGE_S3_ENDPOINT: 'http://garage:3900',
    STORAGE_S3_PUBLIC_ENDPOINT: 'https://files.example.com',
    STORAGE_S3_ACCESS_KEY: 'garage-access',
    STORAGE_S3_SECRET_KEY: 'garage-secret',
    STORAGE_S3_BUCKET: 'garage-bucket',
    MINIO_ENDPOINT: 'http://minio:9000',
    MINIO_PUBLIC_ENDPOINT: 'https://minio.example.com',
    MINIO_ACCESS_KEY: 'minio-access',
    MINIO_SECRET_KEY: 'minio-secret',
    MINIO_BUCKET: 'minio-bucket'
  }

  assert.equal(resolveStorageS3Endpoint(env), 'http://garage:3900')
  assert.equal(resolveStorageS3PublicEndpoint(env), 'https://files.example.com')
  assert.equal(resolveStorageS3AccessKey(env), 'garage-access')
  assert.equal(resolveStorageS3SecretKey(env), 'garage-secret')
  assert.equal(resolveStorageBucket(env), 'garage-bucket')
})

test('S3 storage resolvers keep legacy MinIO environment fallbacks', () => {
  const env = {
    MINIO_ENDPOINT: 'http://minio:9000',
    MINIO_PUBLIC_ENDPOINT: 'https://minio.example.com',
    MINIO_ROOT_USER: 'legacy-access',
    MINIO_ROOT_PASSWORD: 'legacy-secret',
    MINIO_BUCKET: 'legacy-bucket'
  }

  assert.equal(resolveStorageS3Endpoint(env), 'http://minio:9000')
  assert.equal(resolveStorageS3PublicEndpoint(env), 'https://minio.example.com')
  assert.equal(resolveStorageS3AccessKey(env), 'legacy-access')
  assert.equal(resolveStorageS3SecretKey(env), 'legacy-secret')
  assert.equal(resolveStorageBucket(env), 'legacy-bucket')
})

test('validateRuntimeSecurity rejects placeholder secrets in production', () => {
  const report = validateRuntimeSecurity({
    env: {
      NODE_ENV: 'production',
      POSTGRES_PASSWORD: 'nebulynk_dev_password',
      STORAGE_S3_SECRET_KEY: 'nebulynk_dev_password',
      LIVEKIT_API_SECRET: 'change_me_livekit_secret',
      FRONTEND_URL: 'http://chat.example.com'
    },
    authenticationSecret: 'change-me-in-production'
  })

  assert.deepEqual(
    report.errors.map((entry) => entry.code),
    [
      'auth-secret-unsafe',
      'postgres-password-unsafe',
      'storage-s3-secret-unsafe',
      'livekit-secret-unsafe'
    ]
  )
  assert.ok(report.warnings.some((entry) => entry.code === 'frontend-url-not-https'))
  assert.ok(report.warnings.some((entry) => entry.code === 'ai-secret-missing'))
  assert.ok(report.warnings.some((entry) => entry.code === 'passkey-rp-id-missing'))
})

test('validateRuntimeSecurity accepts explicit production secrets', () => {
  const report = validateRuntimeSecurity({
    env: {
      NODE_ENV: 'production',
      POSTGRES_PASSWORD: 'postgres-strong-secret',
      STORAGE_S3_SECRET_KEY: 'storage-strong-secret',
      LIVEKIT_API_SECRET: 'livekit-strong-secret',
      FRONTEND_URL: 'https://chat.example.com',
      PASSKEY_RP_ID: 'chat.example.com',
      AI_SECRET_KEY: 'ai-strong-secret',
      LIVEKIT_PUBLIC_URL: 'wss://livekit.example.com',
      STORAGE_S3_PUBLIC_ENDPOINT: 'https://files.example.com',
      VAPID_PUBLIC_KEY: 'public-vapid',
      VAPID_PRIVATE_KEY: 'private-vapid'
    },
    authenticationSecret: 'jwt-strong-secret'
  })

  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
})

test('validateRuntimeSecurity rejects public S3 endpoint values that target the legacy MinIO console port', () => {
  const report = validateRuntimeSecurity({
    env: {
      NODE_ENV: 'production',
      POSTGRES_PASSWORD: 'postgres-strong-secret',
      STORAGE_S3_SECRET_KEY: 'storage-strong-secret',
      LIVEKIT_API_SECRET: 'livekit-strong-secret',
      FRONTEND_URL: 'https://chat.example.com',
      PASSKEY_RP_ID: 'chat.example.com',
      AI_SECRET_KEY: 'ai-strong-secret',
      LIVEKIT_PUBLIC_URL: 'wss://livekit.example.com',
      STORAGE_S3_PUBLIC_ENDPOINT: 'https://files.example.com:9001',
      VAPID_PUBLIC_KEY: 'public-vapid',
      VAPID_PRIVATE_KEY: 'private-vapid'
    },
    authenticationSecret: 'jwt-strong-secret'
  })

  assert.ok(report.errors.some((entry) => entry.code === 'storage-s3-public-endpoint-console-port'))
})

test('Coolify compose passes required production security environment to backend', async () => {
  const composePath = new URL('../../docker-compose.coolify.yml', import.meta.url)
  const contents = await readFile(composePath, 'utf8')

  assert.match(contents, /JWT_SECRET:\s*\$\{JWT_SECRET:\?JWT_SECRET must be set for production\}/)
  assert.match(contents, /AI_SECRET_KEY:\s*\$\{AI_SECRET_KEY:-\}/)
  assert.doesNotMatch(contents, /AI_CONFIG_MASTER_KEY/)
  assert.match(contents, /RATE_LIMIT_DRIVER:\s*\$\{RATE_LIMIT_DRIVER:-redis\}/)
  assert.match(contents, /PASSKEY_RP_ID:\s*\$\{PASSKEY_RP_ID:-\}/)
  assert.match(contents, /garage:/)
  assert.doesNotMatch(contents, /minio:/)
  assert.match(contents, /dockerfile:\s*garage\.Dockerfile/)
  assert.match(contents, /dockerfile:\s*livekit-egress\.Dockerfile/)
  assert.doesNotMatch(contents, /\.\/garage\.toml:\/etc\/garage\.toml/)
  assert.doesNotMatch(contents, /\.\/livekit-egress\.yaml:\/livekit-egress\.yaml/)
  assert.match(contents, /STORAGE_S3_ENDPOINT:\s*"http:\/\/garage:3900"/)
  assert.match(contents, /STORAGE_S3_PUBLIC_ENDPOINT:\s*\$\{STORAGE_S3_PUBLIC_ENDPOINT:-\$\{MINIO_PUBLIC_ENDPOINT\}\}/)
  assert.match(contents, /AUTH_CSRF_COOKIE_NAME:\s*\$\{AUTH_CSRF_COOKIE_NAME:-nebulynk_csrf_token\}/)
  assert.match(contents, /VITE_AUTH_CSRF_COOKIE_NAME:\s*\$\{AUTH_CSRF_COOKIE_NAME:-nebulynk_csrf_token\}/)
})
