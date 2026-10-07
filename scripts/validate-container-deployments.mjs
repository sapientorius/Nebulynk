import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createContext, root, testEnvironment } from './ci-support.mjs'
import { deploymentFiles, syncContainerVersion } from './sync-container-version.mjs'
import { buildCoolifySourceCompose } from './build-coolify-source-compose.mjs'
import { resolveRuntimeConfig } from '../frontend/scripts/frontend-runtime-config.mjs'

const context = await createContext('deployments')
const parseCompose = (output) => JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1))
const version = await syncContainerVersion({ check: true })
const fixture = {
  ...testEnvironment(), NEBULYNK_ENV_FILE: context.emptyEnv,
  NEBULYNK_DATA_ROOT: '/tmp/nebulynk-ci-data', NEBULYNK_DOMAIN: 'example.com', EDGE_PORT: '49999',
  API_URL: 'https://api.example.com', LIVEKIT_PUBLIC_URL: 'https://calls.example.com',
  FRONTEND_URL: 'https://app.example.com', STORAGE_S3_PUBLIC_ENDPOINT: 'https://files.example.com',
  PASSKEY_RP_ID: 'app.example.com',
  POSTGRES_PASSWORD: 'isolated-deployment-password', JWT_SECRET: 'isolated-deployment-jwt',
  AI_SECRET_KEY: 'isolated-deployment-ai', GARAGE_RPC_SECRET: '0'.repeat(64),
  STORAGE_S3_ACCESS_KEY: 'isolated-ci', STORAGE_S3_SECRET_KEY: 'isolated-deployment-storage',
  LIVEKIT_API_KEY: 'isolated-ci', LIVEKIT_API_SECRET: 'isolated-deployment-livekit',
  SERVICE_URL_BACKEND: 'https://api.example.com', SERVICE_URL_FRONTEND: 'https://app.example.com',
  SERVICE_URL_LIVEKIT: 'https://calls.example.com', SERVICE_URL_GARAGE: 'https://files.example.com',
  SERVICE_FQDN_FRONTEND: 'app.example.com'
}

try {
  await buildCoolifySourceCompose({ check: true })
  for (const file of deploymentFiles) {
    const args = ['compose', '--env-file', context.emptyEnv, '--project-directory', root]
    if (file.includes('self-hosted')) args.push('-f', resolve(root, 'docker-compose.yml'))
    args.push('-f', resolve(root, file), 'config', '--format', 'json')
    for (const selected of [version, '9.8.7', 'staging-aaaaaaaaaaaa-123456']) {
      const output = await context.execute('docker', args, { env: { ...fixture, NEBULYNK_VERSION: selected }, quiet: true })
      const config = parseCompose(output)
      for (const component of ['backend', 'frontend', 'transcription-worker']) {
        assert.equal(config.services[component].image, `ghcr.io/sapientorius/nebulynk-${component}:${selected}`)
      }
      for (const service of Object.values(config.services)) assert.equal(service.build, undefined, `${file} must not build images`)
      const frontend = config.services.frontend
      assert.equal(frontend.environment.API_URL, fixture.API_URL)
      assert.ok(!Object.hasOwn(frontend.environment, 'JWT_SECRET'))
    }
    const overridden = { ...fixture, API_URL: '/api', VITE_API_URL: 'https://obsolete.example.com',
      BACKEND_URL: '', VITE_BACKEND_URL: 'https://obsolete-socket.example.com',
      LIVEKIT_URL: 'wss://configured-calls.example.com', VITE_LIVEKIT_URL: 'wss://obsolete-calls.example.com',
      VAPID_PUBLIC_KEY: '', VITE_VAPID_PUBLIC_KEY: 'obsolete-key', AUTH_CSRF_COOKIE_NAME: 'deployment_csrf' }
    const overriddenOutput = await context.execute('docker', args, { env: overridden, quiet: true })
    const runtime = parseCompose(overriddenOutput).services.frontend.environment
    assert.equal(runtime.API_URL, '/api')
    assert.equal(runtime.BACKEND_URL, '')
    assert.equal(runtime.LIVEKIT_URL, overridden.LIVEKIT_URL)
    assert.equal(runtime.VAPID_PUBLIC_KEY, '')
    assert.equal(runtime.AUTH_CSRF_COOKIE_NAME, 'deployment_csrf')
    const aliases = { ...fixture, VITE_API_URL: 'https://legacy-api.example.com', VITE_LIVEKIT_URL: 'wss://legacy-calls.example.com',
      VITE_BACKEND_URL: 'https://legacy-socket.example.com', VITE_VAPID_PUBLIC_KEY: 'legacy-key', VITE_AUTH_CSRF_COOKIE_NAME: 'legacy_csrf' }
    delete aliases.API_URL
    const aliasOutput = await context.execute('docker', args, { env: aliases, quiet: true })
    const legacy = parseCompose(aliasOutput).services.frontend.environment
    assert.equal(legacy.API_URL, aliases.VITE_API_URL)
    assert.equal(legacy.LIVEKIT_URL, aliases.VITE_LIVEKIT_URL)
    assert.equal(legacy.VAPID_PUBLIC_KEY, aliases.VITE_VAPID_PUBLIC_KEY)
    assert.equal(legacy.BACKEND_URL, aliases.VITE_BACKEND_URL)
    assert.equal(legacy.AUTH_CSRF_COOKIE_NAME, aliases.VITE_AUTH_CSRF_COOKIE_NAME)
    assert.equal(parseCompose(aliasOutput).services.backend.environment.AUTH_CSRF_COOKIE_NAME, aliases.VITE_AUTH_CSRF_COOKIE_NAME)

    // An empty canonical API URL must retain precedence and fail runtime startup,
    // even when a legacy alias or platform default could otherwise supply one.
    const emptyApi = { ...fixture, API_URL: '', VITE_API_URL: 'https://legacy-api.example.com' }
    const emptyOutput = await context.execute('docker', args, { env: emptyApi, quiet: true })
    const emptyRuntime = parseCompose(emptyOutput).services.frontend.environment
    assert.equal(emptyRuntime.API_URL, '')
    assert.throws(() => resolveRuntimeConfig(emptyRuntime), /API_URL .* must be set/)

    // With no API URL variables, only platform-generated defaults may provide one.
    // Other Compose variants pass an empty value to the same startup validator.
    const missingApi = { ...fixture }
    delete missingApi.API_URL
    delete missingApi.VITE_API_URL
    const missingOutput = await context.execute('docker', args, { env: missingApi, quiet: true })
    const missingRuntime = parseCompose(missingOutput).services.frontend.environment
    const defaultApi = file === 'docker-compose.coolify.yml' ? fixture.SERVICE_URL_BACKEND
      : file === 'deploy/plesk/docker-compose.yml' ? `https://${fixture.NEBULYNK_DOMAIN}/api` : ''
    assert.equal(missingRuntime.API_URL, defaultApi)
    if (defaultApi) assert.equal(resolveRuntimeConfig(missingRuntime).apiUrl, defaultApi)
    else assert.throws(() => resolveRuntimeConfig(missingRuntime), /API_URL .* must be set/)
    console.log(`${file}: valid, build-free, matching fixed application versions`)
  }
  const encoded = (await readFile(resolve(root, 'dokploy-template/import.base64'), 'utf8')).trim()
  const imported = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  assert.equal(imported.compose.replace(/\r\n/g, '\n'), (await readFile(resolve(root, 'dokploy-template/docker-compose.yml'), 'utf8')).replace(/\r\n/g, '\n'))
  const sourceOutput = await context.execute('docker', ['compose', '--env-file', context.emptyEnv, '--project-directory', root,
    '-f', resolve(root, 'docker-compose.yml'), '-f', resolve(root, 'docker-compose.self-hosted.yml'), '-f', resolve(root, 'docker-compose.source.yml'),
    'config', '--format', 'json'
  ], { env: fixture, quiet: true })
  const source = parseCompose(sourceOutput)
  assert.equal(source.services.backend.build.target, 'backend')
  assert.equal(source.services['transcription-worker'].build.target, 'transcription-worker')
  assert.equal(source.services.frontend.build.target, 'production-stage')

  const coolifyConfig = async (file, env = fixture) => parseCompose(await context.execute('docker', [
    'compose', '--env-file', context.emptyEnv, '--project-directory', root,
    '-f', resolve(root, file), 'config', '--format', 'json'
  ], { env, quiet: true }))
  const productionCoolify = await coolifyConfig('docker-compose.coolify.yml')
  const sourceCoolify = await coolifyConfig('docker-compose.coolify.source.yml', {
    ...fixture, NEBULYNK_VERSION: '9.8.7', SOURCE_COMMIT: 'branch-commit', NEBULYNK_BUILD_TIME: '2026-10-06T12:00:00Z'
  })
  const sourceTargets = { backend: 'backend', frontend: 'production-stage', 'transcription-worker': 'transcription-worker' }
  for (const [name, target] of Object.entries(sourceTargets)) {
    const service = sourceCoolify.services[name]
    assert.equal(service.image, undefined, `${name} must use the selected Git source, not a registry image`)
    assert.equal(service.pull_policy, 'build', `${name} must rebuild on redeploy`)
    assert.equal(service.build.target, target)
    assert.equal(resolve(service.build.context), resolve(root))
    assert.equal(service.build.dockerfile, `${name === 'frontend' ? 'frontend' : 'backend'}/Dockerfile`)
    assert.equal(service.build.args.BUILD_SHA, 'branch-commit')
    assert.equal(service.build.args.BUILD_TIME, '2026-10-06T12:00:00Z')
    delete service.build
    delete service.pull_policy
    delete productionCoolify.services[name].image
  }
  assert.deepEqual(sourceCoolify, productionCoolify, 'Source builds must preserve Coolify routing, secrets, storage, worker limits and dependencies')
  const explicitProvenance = await coolifyConfig('docker-compose.coolify.source.yml', {
    ...fixture, SOURCE_COMMIT: 'branch-commit', NEBULYNK_BUILD_SHA: 'custom-commit'
  })
  for (const name of Object.keys(sourceTargets)) assert.equal(explicitProvenance.services[name].build.args.BUILD_SHA, 'custom-commit')
  console.log('docker-compose.coolify.source.yml: standalone source builds, matching deployment configuration, branch provenance')
} finally { context.dispose() }
