import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { createContext, freePort, npm, requireDocker, root, testEnvironment, waitFor, withCleanup } from './ci-support.mjs'

const group = process.argv[2]
if (!['integration', 'e2e', 'plesk'].includes(group)) throw new Error('Usage: run-ci-services.mjs integration|e2e|plesk')
const context = await createContext(group)
const { compose, reports, emptyEnv, signal } = context
const env = { ...testEnvironment(), NEBULYNK_ENV_FILE: emptyEnv, DOTENV_CONFIG_PATH: emptyEnv, NODE_ENV: 'test' }
const runScript = (script) => npm(script, { env, signal, logFile: resolve(reports, 'tests.log') })
let started = false
let failure
const pleskCompose = (args, options = {}) => context.execute('docker', [
  'compose', '--env-file', emptyEnv, '--project-name', context.project,
  '--file', resolve(root, 'scripts/plesk-garage-integration.compose.yml'), ...args
], { env, ...options })
try {
  await withCleanup(async () => {
    await requireDocker(context.execute)
    if (group === 'plesk') {
      env.NEBULYNK_CI_STRICT = 'true'
      env.PLESK_FIXTURE_OWNER = context.project
      env.PLESK_GARAGE_PROJECT = context.project
      env.EDGE_TEST_PORT = await freePort()
      started = true
      await runScript('plesk:package')
      await runScript('plesk:package:check')
      await runScript('test:plesk')
      await runScript('test:plesk:garage')
      return
    }
    started = true
    await compose(['up', '--detach', '--wait', '--wait-timeout', '120', ...(group === 'e2e' ? ['postgres', 'redis', 'garage'] : ['postgres'])])
    const port = async (service, target) => {
      const address = (await compose(['port', service, target], { quiet: true })).trim()
      if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error(`Unexpected ${service} address: ${address}`)
      return address.split(':')[1]
    }
    const postgresPort = await port('postgres', '5432')
    Object.assign(env, {
      NEBULYNK_TEST_POSTGRES_URL: `postgresql://postgres:isolated-ci-password@127.0.0.1:${postgresPort}/postgres`,
      NEBULYNK_TEST_POSTGRES_ISOLATED: 'true'
    })
    if (group === 'integration') return await runScript('test:backend:integration')
    const redisPort = await port('redis', '6379')
    const garagePort = await port('garage', '3900')
    const endpoint = `http://127.0.0.1:${garagePort}`
    await waitFor(async () => {
      try { await fetch(endpoint, { signal: AbortSignal.timeout(2000) }); return true } catch { return false }
    }, { signal })
    Object.assign(env, {
      NEBULYNK_CI_STRICT: 'true',
      POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: postgresPort,
      POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'isolated-ci-password', POSTGRES_ADMIN_DB: 'postgres',
      E2E_POSTGRES_DB: 'nebulynk_ci_e2e', POSTGRES_DB: 'nebulynk_ci_e2e',
      E2E_BACKEND_PORT: await freePort(), E2E_FRONTEND_PORT: await freePort(),
      E2E_USE_PREVIEW_FRONTEND: 'true', E2E_EXTERNAL_SERVERS: 'false',
      RATE_LIMIT_DRIVER: 'redis', REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      JWT_SECRET: 'isolated-ci-jwt-not-for-deployment-2026',
      STORAGE_S3_ENDPOINT: endpoint, STORAGE_S3_PUBLIC_ENDPOINT: endpoint,
      STORAGE_S3_ACCESS_KEY: 'nebulynk', STORAGE_S3_SECRET_KEY: 'integration-storage-secret',
      STORAGE_S3_BUCKET: 'nebulynk-files', STORAGE_S3_REGION: 'us-east-1',
      LIVEKIT_HOST: 'http://127.0.0.1:9', LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:9',
      LIVEKIT_API_KEY: 'isolated-ci', LIVEKIT_API_SECRET: 'isolated-ci-livekit-not-for-deployment',
      SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '',
      AUTHENTICATION_RATE_LIMIT_IP_LIMIT: '10000'
    })
    while (env.E2E_BACKEND_PORT === env.E2E_FRONTEND_PORT) env.E2E_FRONTEND_PORT = await freePort()
    await writeFile(resolve(reports, 'endpoints.json'), JSON.stringify({
      backendPort: env.E2E_BACKEND_PORT, frontendPort: env.E2E_FRONTEND_PORT,
      postgresPort, redisPort, garagePort
    }, null, 2))
    await runScript('test:e2e')
  }, async () => {
    if (started) {
      if (group === 'plesk') {
        await withCleanup(
          () => pleskCompose(['down', '--volumes', '--remove-orphans'], { signal: undefined, timeout: 120000 }),
          async () => {
            const ids = (await context.execute('docker', ['ps', '-aq', '--filter', `label=nebulynk.ci=${context.project}`], { signal: undefined, quiet: true, timeout: 15000 })).trim().split(/\s+/).filter(Boolean)
            if (ids.length) await context.execute('docker', ['rm', '--force', ...ids], { signal: undefined, timeout: 30000 })
          }
        )
        return
      }
      await withCleanup(
        () => compose(['logs', '--no-color'], { signal: undefined, logFile: resolve(reports, 'services.log'), quiet: true, timeout: 30000 }),
        () => compose(['down', '--volumes', '--remove-orphans'], { signal: undefined, timeout: 120000 })
      )
    }
  })
} catch (error) {
  failure = error.message
  console.error(error.message)
  for (const cause of error.errors || []) console.error(cause.message)
  process.exitCode = 1
} finally {
  context.dispose()
  await writeFile(resolve(reports, 'result.json'), JSON.stringify({ group, status: failure ? 'failed' : 'passed', failure, node: process.version, platform: process.platform }, null, 2))
}
