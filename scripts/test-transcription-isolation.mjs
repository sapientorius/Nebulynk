import { createContext, requireDocker, root, testEnvironment, waitFor, withCleanup } from './ci-support.mjs'

const context = await createContext('transcription')
const { project, compose } = context
const env = testEnvironment()
const image = process.env.NEBULYNK_TEST_BACKEND_IMAGE || `${project}-backend:latest`
const apiName = `${project}-api`
const workerName = `${project}-worker`
const oomName = `${project}-oom-probe`
const network = `${project}_default`
let builtImage = false
let startedServices = false

const docker = (args, options = {}) => context.execute('docker', args, { env, quiet: true, ...options })
const apiReady = async () => {
  try {
    await docker(['exec', apiName, 'node', '-e',
      "fetch('http://127.0.0.1:3030/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ], { timeout: 5000 })
    return true
  } catch { return false }
}

try {
  await withCleanup(async () => {
    await requireDocker(context.execute)
    if (!process.env.NEBULYNK_TEST_BACKEND_IMAGE) {
      await docker(['build', '-f', 'backend/Dockerfile', '-t', image, root], { quiet: false, timeout: 300_000 })
      builtImage = true
    }
    startedServices = true
    await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'postgres', 'redis', 'garage'], { env })
    const sharedEnvironment = [
      '-e', 'NODE_ENV=test',
      '-e', 'POSTGRES_HOST=postgres', '-e', 'POSTGRES_PORT=5432',
      '-e', 'POSTGRES_DB=postgres', '-e', 'POSTGRES_USER=postgres',
      '-e', 'POSTGRES_PASSWORD=isolated-ci-password',
      '-e', 'REDIS_HOST=redis', '-e', 'RATE_LIMIT_DRIVER=redis',
      '-e', 'JWT_SECRET=isolated-ci-jwt', '-e', 'AI_SECRET_KEY=isolated-ci-ai',
      '-e', 'STORAGE_S3_ENDPOINT=http://garage:3900',
      '-e', 'STORAGE_S3_ACCESS_KEY=nebulynk',
      '-e', 'STORAGE_S3_SECRET_KEY=integration-storage-secret',
      '-e', 'STORAGE_S3_BUCKET=nebulynk-files',
      '-e', 'FRONTEND_URL=http://localhost:5173',
      '-e', 'LIVEKIT_HOST=http://127.0.0.1:9'
    ]
    await docker([
      'run', '-d', '--name', apiName, '--network', network,
      ...sharedEnvironment,
      image, 'node', 'src/index.js'
    ])
    await waitFor(apiReady, { timeout: 120_000 })

    await docker([
      'run', '-d', '--name', workerName, '--network', network,
      '--memory', '1536m', '--cpus', '1.0',
      ...sharedEnvironment,
      image, 'node', 'src/transcription-worker.js'
    ])
    await waitFor(async () => {
      try {
        await docker(['exec', workerName, 'node', 'src/transcription-worker-health.js'], { timeout: 5000 })
        return true
      } catch { return false }
    }, { timeout: 30_000 })

    await docker([
      'run', '-d', '--name', oomName, '--network', network,
      '--memory', '256m', '--memory-swap', '256m', '--restart', 'no',
      ...sharedEnvironment,
      image, 'node', '--input-type=module', '-e',
      "const chunks=[];setTimeout(()=>setInterval(()=>chunks.push(Buffer.alloc(16*1024*1024,1)),10),3000);await import('./src/transcription-worker.js')"
    ])
    await waitFor(async () => {
      const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', oomName]))
      return state.Running === false && state.OOMKilled === true
    }, { timeout: 45_000 })
    if (!await apiReady()) throw new Error('Backend readiness failed after the worker OOM')
    await docker(['exec', workerName, 'node', 'src/transcription-worker-health.js'], { timeout: 5000 })
    console.log('Transcription worker OOM confirmed; backend /health/ready remained HTTP 200 and the other worker stayed healthy')
  }, async () => {
    for (const name of [oomName, workerName, apiName]) {
      try { await docker(['rm', '--force', name]) } catch { /* Container may not have started. */ }
    }
    if (startedServices) {
      await compose(['down', '--volumes', '--remove-orphans'], { env, signal: undefined, timeout: 120_000 })
    }
    if (builtImage) {
      try { await docker(['image', 'rm', image]) } catch { /* Keep Docker cleanup best effort. */ }
    }
  })
} finally {
  context.dispose()
}
