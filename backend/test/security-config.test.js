import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
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

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const coolifyComposePath = fileURLToPath(new URL('../../docker-compose.coolify.yml', import.meta.url))
const dokployComposePath = fileURLToPath(new URL('../../docker-compose.dokploy.yml', import.meta.url))
const dokployTemplateComposePath = fileURLToPath(new URL('../../dokploy-template/docker-compose.yml', import.meta.url))
const dokployTemplateConfigPath = fileURLToPath(new URL('../../dokploy-template/template.toml', import.meta.url))
const dokployTemplateMetadataPath = fileURLToPath(new URL('../../dokploy-template/meta.json', import.meta.url))
const dokployTemplateImportPath = fileURLToPath(new URL('../../dokploy-template/import.base64', import.meta.url))
const dokployTemplateIconPath = fileURLToPath(new URL('../../dokploy-template/nebulynk.png', import.meta.url))
const dokployTemplateBuildScriptPath = fileURLToPath(new URL('../../scripts/build-dokploy-template.mjs', import.meta.url))
const selfHostedComposePath = fileURLToPath(new URL('../../docker-compose.self-hosted.yml', import.meta.url))
const productionEnvExamplePath = fileURLToPath(new URL('../../.env.production.example', import.meta.url))
const normalizeLineEndings = (value) => value.replace(/\r\n?/g, '\n')
const explicitCoolifyOverrideKeys = [
  'POSTGRES_PASSWORD',
  'GARAGE_RPC_SECRET',
  'STORAGE_S3_ACCESS_KEY',
  'STORAGE_S3_SECRET_KEY',
  'JWT_SECRET',
  'AI_SECRET_KEY',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'FRONTEND_URL',
  'PASSKEY_RP_ID',
  'STORAGE_S3_PUBLIC_ENDPOINT',
  'LIVEKIT_PUBLIC_URL'
]
const generatedCoolifyEnvironment = {
  SERVICE_PASSWORD_64_POSTGRES: 'generated-postgres-secret',
  SERVICE_HEX_64_GARAGERPC: 'a'.repeat(64),
  SERVICE_USER_S3: 'generated-s3-user',
  SERVICE_PASSWORD_64_S3: 'generated-s3-secret',
  SERVICE_PASSWORD_64_JWT: 'generated-jwt-secret',
  SERVICE_PASSWORD_64_AI: 'generated-ai-secret',
  SERVICE_USER_LIVEKIT: 'generated-livekit-key',
  SERVICE_PASSWORD_64_LIVEKIT: 'generated-livekit-secret',
  SERVICE_URL_FRONTEND: 'https://app.example.com',
  SERVICE_FQDN_FRONTEND: 'app.example.com',
  SERVICE_URL_BACKEND: 'https://api.example.com',
  SERVICE_URL_LIVEKIT: 'https://livekit.example.com',
  SERVICE_URL_GARAGE: 'https://files.example.com',
  SOURCE_COMMIT: '0123456789abcdef',
  VAPID_PUBLIC_KEY: 'generated-vapid-public-key',
  AUTH_2FA_SECRET_KEY: 'generated-two-factor-secret'
}
const generatedDokployEnvironment = {
  NODE_ENV: 'development',
  POSTGRES_DB: 'nebulynk',
  POSTGRES_USER: 'nebulynk',
  POSTGRES_PASSWORD: 'generated-postgres-secret',
  GARAGE_RPC_SECRET: 'a'.repeat(64),
  STORAGE_S3_ACCESS_KEY: 'generated-s3-user',
  STORAGE_S3_SECRET_KEY: 'generated-s3-secret',
  STORAGE_S3_BUCKET: 'nebulynk-files',
  STORAGE_S3_REGION: 'us-east-1',
  JWT_SECRET: 'generated-jwt-secret',
  AI_SECRET_KEY: 'generated-ai-secret',
  AUTH_2FA_SECRET_KEY: 'generated-two-factor-secret',
  LIVEKIT_API_KEY: 'generated-livekit-key',
  LIVEKIT_API_SECRET: 'generated-livekit-secret',
  FRONTEND_URL: 'https://app.example.com',
  PASSKEY_RP_ID: 'app.example.com',
  VITE_API_URL: 'https://api.example.com',
  LIVEKIT_PUBLIC_URL: 'https://livekit.example.com',
  STORAGE_S3_PUBLIC_ENDPOINT: 'https://files.example.com',
  VAPID_PUBLIC_KEY: 'generated-vapid-public-key',
  AUTH_CSRF_COOKIE_NAME: 'nebulynk_csrf_token',
  NEBULYNK_BUILD_SHA: '0123456789abcdef'
}

function resolveDockerComposeCommand() {
  const plugin = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' })
  if (plugin.status === 0) {
    return { command: 'docker', prefix: ['compose'] }
  }

  const standalone = spawnSync('docker-compose', ['version'], { encoding: 'utf8' })
  if (standalone.status === 0) {
    return { command: 'docker-compose', prefix: [] }
  }

  return null
}

const dockerComposeCommand = resolveDockerComposeCommand()

function renderCoolifyCompose(overrides = {}) {
  const env = {
    ...process.env,
    ...generatedCoolifyEnvironment,
    ...overrides
  }

  for (const key of explicitCoolifyOverrideKeys) {
    if (!Object.hasOwn(overrides, key)) {
      // An explicit empty value prevents a developer's local .env file from
      // shadowing the generated-secret fallback during this contract test.
      env[key] = ''
    }
  }

  const result = spawnSync(
    dockerComposeCommand.command,
    [
      ...dockerComposeCommand.prefix,
      '--file',
      coolifyComposePath,
      'config',
      '--format',
      'json'
    ],
    {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    }
  )

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return JSON.parse(result.stdout)
}

function renderDokployCompose(overrides = {}) {
  const env = {
    ...process.env,
    ...generatedDokployEnvironment,
    ...overrides
  }

  const result = spawnSync(
    dockerComposeCommand.command,
    [
      ...dockerComposeCommand.prefix,
      '--file',
      dokployComposePath,
      'config',
      '--format',
      'json'
    ],
    {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    }
  )

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return JSON.parse(result.stdout)
}

function renderDokployTemplateCompose(overrides = {}) {
  const env = {
    ...process.env,
    ...generatedDokployEnvironment,
    NODE_ENV: 'development',
    FRONTEND_URL: 'http://app.example.com',
    VITE_API_URL: 'http://api.example.com',
    LIVEKIT_PUBLIC_URL: 'http://livekit.example.com',
    STORAGE_S3_PUBLIC_ENDPOINT: 'http://files.example.com',
    NEBULYNK_SOURCE_REF: 'stable',
    ...overrides
  }

  const result = spawnSync(
    dockerComposeCommand.command,
    [
      ...dockerComposeCommand.prefix,
      '--file',
      dokployTemplateComposePath,
      'config',
      '--format',
      'json'
    ],
    {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    }
  )

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return JSON.parse(result.stdout)
}

test('Coolify compose passes generated production configuration to every consumer', {
  skip: !dockerComposeCommand
}, () => {
  const rendered = renderCoolifyCompose()
  const { services } = rendered

  assert.equal(services.postgres.environment.POSTGRES_PASSWORD, 'generated-postgres-secret')
  assert.equal(services.backend.environment.POSTGRES_PASSWORD, 'generated-postgres-secret')

  assert.equal(services.garage.environment.GARAGE_RPC_SECRET, 'a'.repeat(64))
  assert.equal(services.garage.environment.GARAGE_RPC_SECRET.length, 64)
  assert.equal(services.garage.environment.GARAGE_DEFAULT_ACCESS_KEY, 'generated-s3-user')
  assert.equal(services.garage.environment.GARAGE_DEFAULT_SECRET_KEY, 'generated-s3-secret')
  assert.equal(services['livekit-egress'].environment.AWS_ACCESS_KEY_ID, 'generated-s3-user')
  assert.equal(services['livekit-egress'].environment.AWS_SECRET_ACCESS_KEY, 'generated-s3-secret')
  assert.equal(services.backend.environment.STORAGE_S3_ACCESS_KEY, 'generated-s3-user')
  assert.equal(services.backend.environment.STORAGE_S3_SECRET_KEY, 'generated-s3-secret')

  assert.equal(services.livekit.environment.LIVEKIT_KEYS, 'generated-livekit-key: generated-livekit-secret')
  assert.equal(services['livekit-egress'].environment.LIVEKIT_API_KEY, 'generated-livekit-key')
  assert.equal(services.backend.environment.LIVEKIT_API_SECRET, 'generated-livekit-secret')
  assert.equal(services.backend.environment.AUTH_2FA_SECRET_KEY, 'generated-two-factor-secret')

  assert.equal(services.backend.environment.FRONTEND_URL, 'https://app.example.com')
  assert.equal(services.backend.environment.PASSKEY_RP_ID, 'app.example.com')
  assert.equal(services.backend.environment.STORAGE_S3_PUBLIC_ENDPOINT, 'https://files.example.com')
  assert.equal(services.backend.environment.LIVEKIT_PUBLIC_URL, 'https://livekit.example.com')
  assert.equal(services.backend.environment.NEBULYNK_BUILD_SHA, '0123456789abcdef')
  assert.equal(services.frontend.build.args.VITE_API_URL, 'https://api.example.com')
  assert.equal(services.frontend.build.args.VITE_LIVEKIT_URL, 'https://livekit.example.com')
  assert.equal(services.frontend.build.args.VITE_VAPID_PUBLIC_KEY, 'generated-vapid-public-key')
})

test('Coolify compose preserves explicit secrets for existing installations', {
  skip: !dockerComposeCommand
}, () => {
  const rendered = renderCoolifyCompose({
    POSTGRES_PASSWORD: 'existing-postgres-secret',
    GARAGE_RPC_SECRET: 'b'.repeat(64),
    STORAGE_S3_ACCESS_KEY: 'existing-s3-user',
    STORAGE_S3_SECRET_KEY: 'existing-s3-secret',
    JWT_SECRET: 'existing-jwt-secret',
    AI_SECRET_KEY: 'existing-ai-secret',
    AUTH_2FA_SECRET_KEY: 'existing-two-factor-secret',
    LIVEKIT_API_KEY: 'existing-livekit-key',
    LIVEKIT_API_SECRET: 'existing-livekit-secret'
  })
  const { services } = rendered

  assert.equal(services.postgres.environment.POSTGRES_PASSWORD, 'existing-postgres-secret')
  assert.equal(services.garage.environment.GARAGE_RPC_SECRET, 'b'.repeat(64))
  assert.equal(services.garage.environment.GARAGE_DEFAULT_ACCESS_KEY, 'existing-s3-user')
  assert.equal(services['livekit-egress'].environment.AWS_SECRET_ACCESS_KEY, 'existing-s3-secret')
  assert.equal(services.backend.environment.JWT_SECRET, 'existing-jwt-secret')
  assert.equal(services.backend.environment.AI_SECRET_KEY, 'existing-ai-secret')
  assert.equal(services.backend.environment.AUTH_2FA_SECRET_KEY, 'existing-two-factor-secret')
  assert.equal(services.livekit.environment.LIVEKIT_KEYS, 'existing-livekit-key: existing-livekit-secret')
})

test('Dokploy compose passes explicit production configuration to every consumer', {
  skip: !dockerComposeCommand
}, () => {
  const rendered = renderDokployCompose()
  const { services, volumes } = rendered

  assert.deepEqual(Object.keys(services).sort(), [
    'backend',
    'frontend',
    'garage',
    'garage-volume-init',
    'livekit',
    'livekit-egress',
    'postgres',
    'redis'
  ])
  assert.deepEqual(Object.keys(volumes).sort(), [
    'nebulynk_garage_data',
    'nebulynk_garage_meta',
    'nebulynk_postgres_data',
    'nebulynk_redis_data'
  ])

  assert.equal(services.postgres.environment.POSTGRES_PASSWORD, 'generated-postgres-secret')
  assert.equal(services.backend.environment.POSTGRES_PASSWORD, 'generated-postgres-secret')
  assert.equal(services.garage.environment.GARAGE_RPC_SECRET, 'a'.repeat(64))
  assert.equal(services.garage.environment.GARAGE_DEFAULT_ACCESS_KEY, 'generated-s3-user')
  assert.equal(services.garage.environment.GARAGE_DEFAULT_SECRET_KEY, 'generated-s3-secret')
  assert.equal(services['livekit-egress'].environment.AWS_ACCESS_KEY_ID, 'generated-s3-user')
  assert.equal(services['livekit-egress'].environment.AWS_SECRET_ACCESS_KEY, 'generated-s3-secret')
  assert.equal(services.livekit.environment.LIVEKIT_KEYS, 'generated-livekit-key: generated-livekit-secret')

  assert.equal(services.backend.environment.JWT_SECRET, 'generated-jwt-secret')
  assert.equal(services.backend.environment.AI_SECRET_KEY, 'generated-ai-secret')
  assert.equal(services.backend.environment.AUTH_2FA_SECRET_KEY, 'generated-two-factor-secret')
  assert.equal(services.backend.environment.FRONTEND_URL, 'https://app.example.com')
  assert.equal(services.backend.environment.PASSKEY_RP_ID, 'app.example.com')
  assert.equal(services.backend.environment.STORAGE_S3_ENDPOINT, 'http://garage:3900')
  assert.equal(services.backend.environment.STORAGE_S3_PUBLIC_ENDPOINT, 'https://files.example.com')
  assert.equal(services.backend.environment.LIVEKIT_HOST, 'http://livekit:7880')
  assert.equal(services.backend.environment.LIVEKIT_PUBLIC_URL, 'https://livekit.example.com')
  assert.equal(services.frontend.build.args.VITE_API_URL, 'https://api.example.com')
  assert.equal(services.frontend.build.args.VITE_LIVEKIT_URL, 'https://livekit.example.com')
  assert.equal(services.frontend.build.args.VITE_VAPID_PUBLIC_KEY, 'generated-vapid-public-key')

  for (const service of Object.values(services)) {
    assert.equal(service.container_name, undefined)
  }
})

test('Dokploy compose rejects a missing required production secret', {
  skip: !dockerComposeCommand
}, () => {
  const env = { ...process.env, ...generatedDokployEnvironment }
  // An explicit empty value takes precedence over a developer's local .env.
  env.JWT_SECRET = ''

  const result = spawnSync(
    dockerComposeCommand.command,
    [
      ...dockerComposeCommand.prefix,
      '--file',
      dokployComposePath,
      'config',
      '--format',
      'json'
    ],
    {
      cwd: repositoryRoot,
      env,
      encoding: 'utf8'
    }
  )

  assert.notEqual(result.status, 0)
})

test('Dokploy template packages a reproducible native-domain import', async () => {
  const [compose, config, metadataContents, encoded, icon] = await Promise.all([
    readFile(dokployTemplateComposePath, 'utf8'),
    readFile(dokployTemplateConfigPath, 'utf8'),
    readFile(dokployTemplateMetadataPath, 'utf8'),
    readFile(dokployTemplateImportPath, 'utf8'),
    readFile(dokployTemplateIconPath)
  ])
  const generator = spawnSync(process.execPath, [dokployTemplateBuildScriptPath, '--check'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  })

  assert.equal(generator.status, 0, generator.stderr || generator.error?.message)

  const payload = JSON.parse(Buffer.from(encoded.trim(), 'base64').toString('utf8'))
  assert.deepEqual(Object.keys(payload), ['compose', 'config'])
  assert.deepEqual(payload, {
    compose: normalizeLineEndings(compose),
    config: normalizeLineEndings(config)
  })

  const metadata = JSON.parse(metadataContents)
  assert.equal(metadata.id, 'nebulynk')
  assert.equal(metadata.name, 'Nebulynk')
  assert.equal(metadata.version, 'stable')
  assert.equal(metadata.logo, 'nebulynk.png')
  assert.equal(metadata.links.github, 'https://github.com/sapientorius/Nebulynk')
  assert.ok(metadata.tags.includes('self-hosted'))
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])

  const remoteBuildContext = 'context: "https://github.com/sapientorius/Nebulynk.git#${NEBULYNK_SOURCE_REF:-stable}"'
  assert.equal(compose.split(remoteBuildContext).length - 1, 5)
  assert.match(compose, /^\s+- "7881:7881"$/m)
  assert.match(compose, /^\s+- "7882:7882\/udp"$/m)
  assert.doesNotMatch(compose, /^\s*(?:container_name|networks|labels):/m)
  assert.doesNotMatch(compose, /traefik\./)

  assert.match(config, /^isolated = true$/m)
  assert.match(config, /^postgres_password = "\$\{password:64\}"$/m)
  assert.match(config, /^garage_rpc_secret = "\$\{hash:64\}"$/m)
  assert.match(config, /^storage_s3_secret_key = "\$\{password:64\}"$/m)
  assert.match(config, /^jwt_secret = "\$\{password:64\}"$/m)
  assert.match(config, /^ai_secret_key = "\$\{password:64\}"$/m)
  assert.match(config, /^auth_2fa_secret_key = "\$\{password:64\}"$/m)
  assert.match(config, /^livekit_api_secret = "\$\{password:64\}"$/m)
  assert.doesNotMatch(config, /CHANGE_ME|example\.com/i)

  const domains = [
    ['frontend', 8080, 'frontend_domain'],
    ['backend', 3030, 'backend_domain'],
    ['livekit', 7880, 'livekit_domain'],
    ['garage', 3900, 'garage_domain']
  ]

  for (const [serviceName, port, domainVariable] of domains) {
    assert.match(config, new RegExp(
      `\\[\\[config\\.domains\\]\\]\\r?\\nserviceName = "${serviceName}"\\r?\\nport = ${port}\\r?\\nhost = "\\$\\{${domainVariable}\\}"\\r?\\npath = "/"`
    ))
  }

  assert.match(config, /^NODE_ENV = "development"$/m)
  assert.match(config, /^frontend_url = "http:\/\/\$\{frontend_domain\}"$/m)
  assert.match(config, /^backend_url = "http:\/\/\$\{backend_domain\}"$/m)
  assert.match(config, /^livekit_public_url = "http:\/\/\$\{livekit_domain\}"$/m)
  assert.match(config, /^garage_public_url = "http:\/\/\$\{garage_domain\}"$/m)
  assert.match(config, /^NEBULYNK_SOURCE_REF = "\$\{source_ref\}"$/m)
  assert.match(config, /^FRONTEND_URL = "\$\{frontend_url\}"$/m)
  assert.match(config, /^PASSKEY_RP_ID = "\$\{frontend_domain\}"$/m)
  assert.match(config, /^VITE_API_URL = "\$\{backend_url\}"$/m)
  assert.match(config, /^LIVEKIT_PUBLIC_URL = "\$\{livekit_public_url\}"$/m)
  assert.match(config, /^STORAGE_S3_PUBLIC_ENDPOINT = "\$\{garage_public_url\}"$/m)

  const optionalTemplateEnvironment = {
    KLIPY_API_KEY: '',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: '',
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_IGNORE_TLS: 'false',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: '',
    SMTP_FROM_NAME: 'Nebulynk',
    AUTHENTICATION_RATE_LIMIT_IP_LIMIT: '',
    AUTH_BROWSER_ACCESS_TOKEN_TTL: '15m',
    AUTH_REFRESH_TOKEN_TTL: '1d',
    AUTH_REMEMBER_REFRESH_TOKEN_TTL: '30d',
    AUTH_REFRESH_COOKIE_NAME: 'nebulynk_refresh_session',
    AUTH_CSRF_COOKIE_NAME: 'nebulynk_csrf_token',
    AUTH_COOKIE_DOMAIN: '',
    RATE_LIMIT_DRIVER: 'redis',
    AI_PROVIDER_BASE_URL_ALLOWLIST: '',
    LOG_LEVEL: 'info',
    MAX_FILE_SIZE: '26214400',
    MEETING_TRANSCRIPT_WAIT_TIMEOUT_MS: '1800000',
    TRUST_PROXY: 'true',
    NEBULYNK_BUILD_SHA: ''
  }

  for (const [variable, value] of Object.entries(optionalTemplateEnvironment)) {
    assert.match(config, new RegExp(`^${variable} = "${value}"$`, 'm'))
  }
})

test('Dokploy template renders its generated development contract when Docker Compose is available', {
  skip: !dockerComposeCommand
}, () => {
  const rendered = renderDokployTemplateCompose()
  const { services } = rendered

  assert.deepEqual(Object.keys(services).sort(), [
    'backend',
    'frontend',
    'garage',
    'garage-volume-init',
    'livekit',
    'livekit-egress',
    'postgres',
    'redis'
  ])
  assert.equal(
    services.frontend.build.context,
    'https://github.com/sapientorius/Nebulynk.git#stable'
  )
  assert.equal(services.backend.environment.NODE_ENV, 'development')
  assert.equal(services.backend.environment.FRONTEND_URL, 'http://app.example.com')
  assert.equal(services.backend.environment.PASSKEY_RP_ID, 'app.example.com')
  assert.equal(services.backend.environment.STORAGE_S3_PUBLIC_ENDPOINT, 'http://files.example.com')
  assert.equal(services.backend.environment.LIVEKIT_PUBLIC_URL, 'http://livekit.example.com')
  assert.equal(services.frontend.build.args.VITE_API_URL, 'http://api.example.com')

  const productionRendered = renderDokployTemplateCompose({ NODE_ENV: 'production' })
  assert.equal(productionRendered.services.backend.environment.NODE_ENV, 'production')

  for (const service of Object.values(services)) {
    assert.equal(service.container_name, undefined)
  }
})

test('self-hosted production configuration uses one CSRF cookie setting for backend and frontend', async () => {
  const [environmentTemplate, compose] = await Promise.all([
    readFile(productionEnvExamplePath, 'utf8'),
    readFile(selfHostedComposePath, 'utf8')
  ])

  assert.match(environmentTemplate, /^AUTH_CSRF_COOKIE_NAME=nebulynk_csrf_token$/m)
  assert.doesNotMatch(environmentTemplate, /^VITE_AUTH_CSRF_COOKIE_NAME=/m)
  assert.match(compose, /VITE_AUTH_CSRF_COOKIE_NAME:\s*\$\{AUTH_CSRF_COOKIE_NAME:-nebulynk_csrf_token\}/)
  assert.match(environmentTemplate, /^AUTH_2FA_SECRET_KEY=CHANGE_ME_STRONG_UNIQUE_2FA_ENCRYPTION_KEY$/m)
  assert.match(environmentTemplate, /^KLIPY_API_KEY=$/m)
})

test('Dokploy compose exposes only the supported deployment variable and network contract', async () => {
  const contents = await readFile(dokployComposePath, 'utf8')
  const requiredVariables = [
    'POSTGRES_PASSWORD',
    'GARAGE_RPC_SECRET',
    'STORAGE_S3_ACCESS_KEY',
    'STORAGE_S3_SECRET_KEY',
    'JWT_SECRET',
    'AI_SECRET_KEY',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'PASSKEY_RP_ID',
    'FRONTEND_URL',
    'LIVEKIT_PUBLIC_URL',
    'STORAGE_S3_PUBLIC_ENDPOINT',
    'VITE_API_URL'
  ]

  for (const variable of requiredVariables) {
    assert.match(contents, new RegExp(
      `${variable}:\\s*"\\$\\{${variable}:\\?${variable} must be set\\}"`
    ))
  }

  assert.match(contents, /AUTH_2FA_SECRET_KEY:\s*"\$\{AUTH_2FA_SECRET_KEY:-\}"/)

  assert.match(contents, /dockerfile:\s*garage\.Dockerfile/)
  assert.match(contents, /dockerfile:\s*livekit\.Dockerfile/)
  assert.match(contents, /dockerfile:\s*livekit-egress\.Dockerfile/)
  assert.match(contents, /STORAGE_S3_ENDPOINT:\s*http:\/\/garage:3900/)
  assert.match(contents, /LIVEKIT_HOST:\s*http:\/\/livekit:7880/)
  assert.match(contents, /LIVEKIT_WS_URL:\s*ws:\/\/livekit:7880/)
  assert.match(contents, /^\s+- "8080"$/m)
  assert.match(contents, /^\s+- "3030"$/m)
  assert.match(contents, /^\s+- "3900"$/m)
  assert.match(contents, /^\s+- "7880"$/m)
  assert.equal((contents.match(/^\s+ports:$/gm) || []).length, 1)
  assert.match(contents, /^\s+- "7881:7881"$/m)
  assert.match(contents, /^\s+- "7882:7882\/udp"$/m)
  assert.doesNotMatch(contents, /^\s*container_name:/m)
  assert.doesNotMatch(contents, /^\s*networks:/m)
  assert.doesNotMatch(contents, /^\s*labels:/m)
  assert.doesNotMatch(contents, /traefik\./)
  assert.doesNotMatch(contents, /env_file:/)
  assert.doesNotMatch(contents, /\.\/garage\.toml:\/etc\/garage\.toml/)
  assert.doesNotMatch(contents, /\.\/livekit-egress\.yaml:\/livekit-egress\.yaml/)
})

test('Coolify compose exposes only the supported deployment variable contract', async () => {
  const composePath = new URL('../../docker-compose.coolify.yml', import.meta.url)
  const baseComposePath = new URL('../../docker-compose.yml', import.meta.url)
  const [contents, baseContents, selfHostedContents] = await Promise.all([
    readFile(composePath, 'utf8'),
    readFile(baseComposePath, 'utf8'),
    readFile(selfHostedComposePath, 'utf8')
  ])

  assert.match(contents, /JWT_SECRET:\s*\$\{JWT_SECRET:-\$\{SERVICE_PASSWORD_64_JWT\}\}/)
  assert.match(contents, /AI_SECRET_KEY:\s*\$\{AI_SECRET_KEY:-\$\{SERVICE_PASSWORD_64_AI\}\}/)
  assert.match(contents, /AUTH_2FA_SECRET_KEY:\s*\$\{AUTH_2FA_SECRET_KEY:-\}/)
  assert.doesNotMatch(contents, /AI_CONFIG_MASTER_KEY/)
  assert.match(contents, /RATE_LIMIT_DRIVER:\s*\$\{RATE_LIMIT_DRIVER:-redis\}/)
  assert.match(contents, /PASSKEY_RP_ID:\s*\$\{PASSKEY_RP_ID:-\$\{SERVICE_FQDN_FRONTEND\}\}/)
  assert.match(contents, /garage:/)
  assert.doesNotMatch(contents, /minio:/)
  assert.doesNotMatch(contents, /MINIO_/)
  assert.doesNotMatch(baseContents, /MINIO_/)
  assert.doesNotMatch(selfHostedContents, /MINIO_/)
  assert.doesNotMatch(contents, /S3_ROOT_/)
  assert.doesNotMatch(contents, /COOLIFY_URL_/)
  assert.match(contents, /dockerfile:\s*garage\.Dockerfile/)
  assert.match(contents, /dockerfile:\s*livekit-egress\.Dockerfile/)
  assert.doesNotMatch(contents, /\.\/garage\.toml:\/etc\/garage\.toml/)
  assert.doesNotMatch(contents, /\.\/livekit-egress\.yaml:\/livekit-egress\.yaml/)
  assert.match(contents, /STORAGE_S3_ENDPOINT:\s*"http:\/\/garage:3900"/)
  assert.match(contents, /STORAGE_S3_PUBLIC_ENDPOINT:\s*\$\{STORAGE_S3_PUBLIC_ENDPOINT:-\$\{SERVICE_URL_GARAGE\}\}/)
  assert.match(contents, /LIVEKIT_PUBLIC_URL:\s*\$\{LIVEKIT_PUBLIC_URL:-\$\{SERVICE_URL_LIVEKIT\}\}/)
  assert.match(contents, /VITE_API_URL:\s*\$\{SERVICE_URL_BACKEND\}/)
  assert.match(contents, /VITE_LIVEKIT_URL:\s*\$\{SERVICE_URL_LIVEKIT\}/)
  assert.match(contents, /VITE_VAPID_PUBLIC_KEY:\s*\$\{VAPID_PUBLIC_KEY:-\}/)
  assert.doesNotMatch(contents, /NEBULYNK_UPDATE_PUBLIC_KEYS_JSON/)
  assert.doesNotMatch(contents, /NEBULYNK_BUILD_TIME/)
  assert.match(contents, /NEBULYNK_BUILD_SHA:\s*\$\{SOURCE_COMMIT:-\}/)
  assert.doesNotMatch(contents, /"3900:3900"/)
  assert.doesNotMatch(contents, /"7880:7880"/)
  assert.match(contents, /- "7881:7881"/)
  assert.match(contents, /- "7882:7882\/udp"/)
  assert.match(selfHostedContents, /VITE_LIVEKIT_URL:\s*\$\{LIVEKIT_PUBLIC_URL:\?LIVEKIT_PUBLIC_URL must be set\}/)
  assert.match(selfHostedContents, /VITE_VAPID_PUBLIC_KEY:\s*\$\{VAPID_PUBLIC_KEY:-\}/)
  assert.match(contents, /AUTH_CSRF_COOKIE_NAME:\s*\$\{AUTH_CSRF_COOKIE_NAME:-nebulynk_csrf_token\}/)
  assert.match(contents, /VITE_AUTH_CSRF_COOKIE_NAME:\s*\$\{AUTH_CSRF_COOKIE_NAME:-nebulynk_csrf_token\}/)
})
