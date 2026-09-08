import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createContext, npm, requireDocker, run, testEnvironment, waitFor, withCleanup } from './ci-support.mjs'
import { runScanner, snapshotTracked } from './run-ci-security.mjs'

test('process errors and nonzero exits are failures, including scanner failures', async () => {
  await assert.rejects(run('nebulynk-missing-executable', [], { quiet: true }), /ENOENT/)
  await assert.rejects(run(process.execPath, ['-e', 'process.exit(23)'], { quiet: true }), (error) => error.code === 23)
  await assert.rejects(runScanner(async (_command, args) => args[0] === 'inspect' ? '23\n' : '', 'owned-scanner'), /exit 23/)
  await assert.rejects(runScanner(async () => { throw new Error('scanner unavailable') }, 'owned-scanner'), /unavailable/)
})

test('a hung process can be aborted and a readiness timeout is not success', async () => {
  const controller = new AbortController()
  const child = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { quiet: true, signal: controller.signal })
  controller.abort(new Error('controlled interruption'))
  await assert.rejects(child, /controlled interruption/)
  await assert.rejects(waitFor(async () => false, { timeout: 20, interval: 5 }), /timed out/)
  await assert.rejects(waitFor(async () => true, { signal: controller.signal }), /controlled interruption/)
})

test('missing Docker, wrong engine, and missing Compose all fail closed', async () => {
  await assert.rejects(requireDocker(async () => { throw new Error('Docker missing') }), /Docker missing/)
  await assert.rejects(requireDocker(async () => 'windows'), /Linux Docker/)
  await assert.rejects(requireDocker(async (_cmd, args) => {
    if (args[0] === 'info') return 'linux\n'
    throw new Error('Compose missing')
  }), /Compose missing/)
})

test('cleanup runs after setup/test failure and its failure also fails the group', async () => {
  const calls = []
  await assert.rejects(withCleanup(async () => { calls.push('setup'); throw new Error('setup failed') }, async () => { calls.push('cleanup') }), /setup failed/)
  assert.deepEqual(calls, ['setup', 'cleanup'])
  await assert.rejects(withCleanup(async () => {}, async () => { throw new Error('cleanup failed') }), /cleanup failed/)
  await assert.rejects(withCleanup(async () => { throw new Error('test failed') }, async () => { throw new Error('cleanup failed') }), (error) => error.errors.length === 2)
})

test('test environments never inherit developer endpoints or credentials', () => {
  const env = testEnvironment({ PATH: 'tools', SystemRoot: 'windows', POSTGRES_DB: 'developer', SMTP_PASS: 'private', VITE_API_URL: 'external', NODE_OPTIONS: 'injected', E2E_EXTERNAL_SERVERS: 'true' })
  assert.deepEqual(env, { PATH: 'tools', SystemRoot: 'windows' })
})

test('shared npm entry fails on a controlled error in an isolated copy', async () => {
  const fixture = await mkdtemp(join(os.tmpdir(), 'nebulynk-ci-negative-'))
  try {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ scripts: {
      ci: manifest.scripts.ci, 'ci:core': 'node fail.cjs', 'ci:integration': 'node later.cjs'
    } }))
    await writeFile(join(fixture, 'fail.cjs'), "console.error('AP06_CONTROLLED_FAILURE'); process.exit(17)")
    await writeFile(join(fixture, 'later.cjs'), "require('node:fs').writeFileSync('unexpected', 'ran')")
    await assert.rejects(npm('ci', { cwd: fixture, quiet: true }), (error) => error.code === 17 && /AP06_CONTROLLED_FAILURE/.test(error.output))
    await assert.rejects(readFile(join(fixture, 'unexpected')), { code: 'ENOENT' })
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('scan snapshot uses tracked working bytes, omits artifacts, and rejects escaping paths', async () => {
  const fixture = await mkdtemp(join(os.tmpdir(), 'nebulynk-ci-snapshot-'))
  const repository = join(fixture, 'repo')
  const snapshot = join(fixture, 'snapshot')
  try {
    await mkdir(repository)
    await mkdir(snapshot)
    await writeFile(join(repository, 'source.js'), 'current working bytes')
    await writeFile(join(repository, '.env'), 'untracked private values')
    await snapshotTracked(async () => 'source.js\0deleted.js\0', snapshot, repository)
    assert.equal(await readFile(join(snapshot, 'source.js'), 'utf8'), 'current working bytes')
    await assert.rejects(readFile(join(snapshot, '.env')), { code: 'ENOENT' })
    await assert.rejects(snapshotTracked(async () => '../outside\0', snapshot, repository), /escapes/)
  } finally { await rm(fixture, { recursive: true, force: true }) }
})

test('each context confines Compose cleanup to its own randomly named project', async () => {
  const calls = []
  const execute = async (_command, args) => { calls.push(args); return '' }
  const first = await createContext('e2e', { execute })
  const second = await createContext('e2e', { execute })
  try {
    assert.notEqual(first.project, second.project)
    await first.compose(['down', '--volumes', '--remove-orphans'])
    assert.equal(calls[0][calls[0].indexOf('--project-name') + 1], first.project)
    assert.ok(!calls[0].includes(second.project))
    assert.equal(calls[0][calls[0].indexOf('--env-file') + 1], first.emptyEnv)
    await assert.rejects(createContext('../developer'), /Invalid CI group/)
  } finally {
    first.dispose(); second.dispose()
    await rm(first.reports, { recursive: true, force: true })
    await rm(second.reports, { recursive: true, force: true })
  }
})
