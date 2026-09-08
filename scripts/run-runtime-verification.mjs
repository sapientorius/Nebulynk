import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { renderRuntimeReport } from './runtime-report.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const mode = process.argv[2]
if (!['benchmark', 'lifecycle', 'history'].includes(mode) || process.argv.slice(3).some((arg) => arg !== '--quick')) throw new Error('Usage: runner benchmark|lifecycle|history [--quick]')
const project = `nebulynk-ap05-${randomBytes(6).toString('hex')}`
const results = resolve(root, 'output', 'ap05', project)
await mkdir(results, { recursive: true })
await writeFile(resolve(results, 'empty.env'), '')
const env = {
  ...process.env,
  AP05_RESULTS_DIR: results.replaceAll('\\', '/'),
  AP05_TEST_UID: String(process.getuid?.() ?? 1000),
  AP05_TEST_GID: String(process.getgid?.() ?? 1000)
}
const composeArgs = ['compose', '--env-file', resolve(results, 'empty.env'), '-p', project, '-f', resolve(root, 'scripts/runtime-test.compose.yml')]
function docker(args, { quiet = false, allowFailure = false } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn('docker', args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk; if (!quiet) process.stdout.write(chunk) })
    child.stderr.on('data', (chunk) => { output += chunk; if (!quiet) process.stderr.write(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 || allowFailure) resolveCommand(output)
      else reject(Object.assign(new Error(`docker ${args.join(' ')} exited ${code}\n${output.slice(-6000)}`), { output }))
    })
  })
}
const compose = (...args) => docker([...composeArgs, ...args])
async function capture(name, args) {
  try {
    const output = await docker(args, { quiet: true })
    await writeFile(resolve(results, name), output)
    return output
  } catch (error) {
    await writeFile(resolve(results, name), error.output || error.message)
    throw error
  }
}
async function waitFile(name) {
  for (let count = 0; count < 120; count++) {
    try { await access(resolve(results, name)); return } catch { await delay(500) }
  }
  throw new Error(`Timed out waiting for ${name}`)
}
let monitorStop = false
let monitorPromise
console.log(`Isolated AP-05 project: ${project}\nReports: ${results}`)
try {
  await capture('docker-info.json', ['info', '--format', '{{json .}}'])
  await capture('host-containers.jsonl', ['ps', '--format', '{{json .}}'])
  await compose('build', 'backend', 'generator')
  await compose('up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'garage', 'backend')
  const ids = (await docker([...composeArgs, 'ps', '-q'], { quiet: true })).trim().split(/\s+/)
  await capture('container-config.json', ['inspect', ...ids])
  await capture('node-version.txt', [...composeArgs, 'exec', '-T', 'backend', 'node', '--version'])
  await capture('postgres-version.txt', [...composeArgs, 'exec', '-T', 'postgres', 'psql', '-U', 'ap05', '-d', 'nebulynk_ap05', '-Atc', 'SELECT version()'])
  if (mode === 'lifecycle') {
    await capture('lifecycle-tests.txt', [...composeArgs, 'run', '--rm', 'generator', 'node', '--test', '--test-timeout=30000', 'test/runtime.test.js', 'test/notification-side-effects.test.js', 'test/presence.test.js', 'lifecycle/process.test.js', 'lifecycle/recovery.test.js'])
    await capture('postgres-integration.txt', [...composeArgs, 'run', '--rm', 'generator', 'npm', 'run', 'test:integration'])
    const client = compose('run', '--rm', 'generator', 'node', 'scripts/runtime-smoke-client.mjs')
    await waitFile('socket-ready')
    const started = Date.now()
    await compose('stop', 'backend')
    await client
    const backendId = (await docker([...composeArgs, 'ps', '-a', '-q', 'backend'], { quiet: true })).trim()
    const [backend] = JSON.parse(await docker(['inspect', backendId], { quiet: true }))
    assert.equal(backend.State.ExitCode, 0)
    assert.deepEqual(backend.Config.Cmd, ['node', 'src/index.js'])
    assert.ok(Date.now() - started < 65000)
    await waitFile('socket-closed.json')
    await writeFile(resolve(results, 'smoke.json'), JSON.stringify({ exitCode: backend.State.ExitCode, elapsedMs: Date.now() - started, entrypoint: backend.Config.Cmd }))
    await compose('up', '-d', '--wait', 'backend')
  } else {
    if (mode !== 'history') await compose('run', '--rm', 'generator', 'node', 'scripts/runtime-benchmark-seed.mjs')
    await compose('run', '--rm', 'generator', 'node', 'scripts/seed-meeting-history-benchmark.mjs', '--apply', '--prefix=ap05-meeting-history')
    const telemetry = []
    monitorPromise = (async () => {
      while (!monitorStop) {
        const allIds = (await docker(['ps', '--filter', `label=com.docker.compose.project=${project}`, '-q'], { quiet: true })).trim().split(/\s+/)
        let stats
        try {
          stats = await docker(['stats', '--no-stream', '--format', '{{json .}}', ...allIds], { quiet: true })
        } catch (error) {
          // One-off generator containers can disappear between ps and stats.
          // Retry only that membership race; daemon failures still fail the run.
          const currentIds = (await docker(['ps', '--filter', `label=com.docker.compose.project=${project}`, '-q'], { quiet: true })).trim().split(/\s+/)
          if (currentIds.join(',') === allIds.join(',')) throw error
          stats = await docker(['stats', '--no-stream', '--format', '{{json .}}', ...currentIds], { quiet: true })
        }
        const database = await docker([...composeArgs, 'exec', '-T', 'postgres', 'psql', '-U', 'ap05', '-d', 'nebulynk_ap05', '-Atc', "SELECT json_build_object('activity',(SELECT json_agg(t) FROM (SELECT state,wait_event_type,count(*) FROM pg_stat_activity GROUP BY 1,2) t),'database',(SELECT row_to_json(d) FROM pg_stat_database d WHERE datname=current_database()),'waitingLocks',(SELECT count(*) FROM pg_locks WHERE NOT granted))"], { quiet: true })
        telemetry.push({ at: new Date().toISOString(), stats, database })
        await writeFile(resolve(results, 'telemetry.json'), JSON.stringify(telemetry, null, 2))
        for (let n = 0; n < 10 && !monitorStop; n++) await delay(1000)
      }
    })()
    const monitorFailure = monitorPromise.then(() => new Promise(() => {}))
    if (mode !== 'history') await Promise.race([compose('run', '--rm', '--name', `${project}-generator`, 'generator', 'node', 'scripts/runtime-benchmark-client.mjs', ...process.argv.slice(3)), monitorFailure])
    await Promise.race([capture('meeting-history.txt', [...composeArgs, 'run', '--rm', 'generator', 'node', 'scripts/benchmark-meeting-history-access.mjs']), monitorFailure])
    if (mode !== 'history') {
    const report = JSON.parse(await readFile(resolve(results, 'runtime-results.json'), 'utf8'))
    monitorStop = true
    await monitorPromise
    const markdown = renderRuntimeReport({ project, report,
      dockerInfo: JSON.parse(await readFile(resolve(results, 'docker-info.json'), 'utf8')),
      telemetry: JSON.parse(await readFile(resolve(results, 'telemetry.json'), 'utf8')),
      nodeVersion: await readFile(resolve(results, 'node-version.txt'), 'utf8'),
      postgresVersion: await readFile(resolve(results, 'postgres-version.txt'), 'utf8')
    })
    await writeFile(resolve(results, 'REPORT.md'), markdown)
    }
  }
} finally {
  monitorStop = true
  await monitorPromise?.catch((error) => console.error(error))
  await capture('container-logs.txt', [...composeArgs, 'logs', '--no-color']).catch((error) => console.error(error))
  await docker([...composeArgs, 'down', '--volumes', '--remove-orphans'], { allowFailure: false })
}
