import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { changedPaths, isDocumentationPath, planChecks, requireChecks } from './ci-policy.mjs'

const before = 'a'.repeat(40)
const after = 'b'.repeat(40)
const statuses = (plan) => {
  const needs = { scope: { result: 'success', outputs: Object.fromEntries(Object.entries(plan).map(([key, value]) => [key, String(value)])) } }
  for (const [name, mandatory] of Object.entries({ validate: plan.core, 'postgres-integration': plan.full, plesk: plan.full, security: plan.full, e2e: plan.full, containers: plan.containers })) {
    needs[name] = { result: mandatory ? 'success' : 'skipped' }
  }
  return needs
}

test('normal code pushes select quick checks; code PRs select the complete gate', () => {
  assert.deepEqual(planChecks({ eventName: 'push', paths: ['backend/src/app.js'] }), { profile: 'quick', core: true, full: false, containers: false })
  assert.deepEqual(planChecks({ eventName: 'pull_request', paths: ['frontend/src/App.vue'] }), { profile: 'full', core: true, full: true, containers: true })
})

test('only recognized documentation can skip automatic application checks', () => {
  const docs = ['README.md', 'docs/STAGING.md', 'docs/images/example.png', 'backend/README.md']
  for (const eventName of ['push', 'pull_request']) {
    assert.deepEqual(planChecks({ eventName, paths: docs }), { profile: 'documentation', core: false, full: false, containers: false })
  }
  for (const path of ['package-lock.json', '.github/workflows/ci.yml', 'docker-compose.yml', 'docs/example.mjs', 'docs/example.yml', 'frontend/public/example.svg', 'frontend/src/help.md']) {
    assert.equal(isDocumentationPath(path), false, path)
    assert.notEqual(planChecks({ eventName: 'push', paths: [...docs, path] }).profile, 'documentation', path)
  }
})

test('explicit staging/release and manual full profiles ignore documentation-only changes', () => {
  for (const eventName of ['push', 'workflow_dispatch', 'pull_request']) {
    assert.deepEqual(planChecks({ eventName, paths: ['README.md'], profile: 'full' }), { profile: 'full', core: true, full: true, containers: true })
  }
  assert.equal(planChecks({ eventName: 'workflow_dispatch', paths: ['README.md'] }).profile, 'full')
})

test('publication pipelines can use their native candidate checks while retaining all other full gates', () => {
  const plan = planChecks({ eventName: 'workflow_dispatch', profile: 'full', localContainers: false })
  assert.deepEqual(plan, { profile: 'full', core: true, full: true, containers: false })
  requireChecks(statuses(plan))
})

test('unknown changes require code checks and invalid configuration cannot disable the gate', () => {
  assert.equal(planChecks({ eventName: 'push' }).profile, 'quick')
  assert.equal(planChecks({ eventName: 'pull_request' }).profile, 'full')
  assert.equal(planChecks({ eventName: 'unknown', paths: [] }).profile, 'full')
  assert.throws(() => planChecks({ eventName: 'push', profile: 'disabled' }), /Unknown CI profile/)
  assert.throws(() => planChecks({ eventName: 'push', localContainers: 'false' }), /boolean/)
})

test('a missing force-push base falls back to code checks; a new branch checks all tracked paths', () => {
  const unavailable = () => { throw new Error('unknown commit') }
  assert.equal(changedPaths('push', { before, after }, { git: unavailable }), null)
  assert.deepEqual(changedPaths('push', { before: '0'.repeat(40), after }, { git: () => 'README.md\0backend/src/app.js\0' }), ['README.md', 'backend/src/app.js'])
  assert.equal(changedPaths('push', { before: '--unsafe', after }), null)
})

test('PR comparisons use the merge base, preserve path boundaries and include removed rename paths', () => {
  let args
  const paths = changedPaths('pull_request', { pull_request: { base: { sha: before }, head: { sha: after } } }, {
    git: (values) => { args = values; return 'docs/with spaces.md\0backend/src/removed.js\0' }
  })
  assert.deepEqual(args, ['diff', '--no-renames', '--name-only', '-z', `${before}...${after}`, '--'])
  assert.deepEqual(paths, ['docs/with spaces.md', 'backend/src/removed.js'])
})

test('a real source rename into docs cannot masquerade as documentation-only changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nebulynk-ci-policy-'))
  const git = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const commit = (message) => git(['-c', 'user.name=CI policy fixture', '-c', 'user.email=ci-policy@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', message])
  try {
    git(['init', '--quiet'])
    await mkdir(join(directory, 'backend'))
    await mkdir(join(directory, 'docs'))
    await writeFile(join(directory, 'backend', 'app.js'), 'export default 1\n')
    git(['add', '.'])
    commit('source')
    const base = git(['rev-parse', 'HEAD']).trim()
    await rename(join(directory, 'backend', 'app.js'), join(directory, 'docs', 'example.md'))
    git(['add', '-A'])
    commit('rename')
    const head = git(['rev-parse', 'HEAD']).trim()
    const paths = changedPaths('push', { before: base, after: head }, { git })
    assert.deepEqual(paths, ['backend/app.js', 'docs/example.md'])
    assert.equal(planChecks({ eventName: 'push', paths }).profile, 'quick')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('required status accepts only deliberate skips for each profile', () => {
  for (const args of [
    { eventName: 'push', paths: ['README.md'] },
    { eventName: 'push', paths: ['backend/src/app.js'] },
    { eventName: 'pull_request', paths: ['backend/src/app.js'] }
  ]) requireChecks(statuses(planChecks(args)))
})

test('failed, cancelled, missing and unexpectedly skipped required groups block publication', () => {
  const plan = planChecks({ eventName: 'pull_request', paths: ['backend/src/app.js'] })
  for (const name of ['validate', 'postgres-integration', 'plesk', 'security', 'e2e', 'containers']) {
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const needs = statuses(plan)
      needs[name].result = result
      assert.throws(() => requireChecks(needs), new RegExp(name))
    }
  }
  const quick = statuses(planChecks({ eventName: 'push', paths: ['backend/src/app.js'] }))
  quick.security.result = 'failure'
  assert.throws(() => requireChecks(quick), /security/)
})

test('a failed planner, absent flags or inconsistent profile cannot turn CI green', () => {
  const create = () => statuses(planChecks({ eventName: 'push', paths: ['README.md'] }))
  const failed = create()
  failed.scope.result = 'failure'
  assert.throws(() => requireChecks(failed), /planning/)
  for (const key of ['profile', 'core', 'full', 'containers']) {
    const needs = create()
    delete needs.scope.outputs[key]
    assert.throws(() => requireChecks(needs), /Missing or invalid/)
  }
  const inconsistent = create()
  inconsistent.scope.outputs.full = 'true'
  assert.throws(() => requireChecks(inconsistent), /Inconsistent/)
})

test('GitHub output and result commands round-trip full publication inputs and fail on a skipped test', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nebulynk-ci-policy-cli-'))
  const script = fileURLToPath(new URL('./ci-policy.mjs', import.meta.url))
  const output = join(directory, 'outputs')
  const event = join(directory, 'event.json')
  try {
    await writeFile(event, JSON.stringify({ before, after }))
    const env = { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event,
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: join(directory, 'summary'),
      CI_PROFILE: 'full', CI_LOCAL_CONTAINERS: 'false' }
    execFileSync(process.execPath, [script, 'plan'], { env, stdio: 'pipe' })
    const values = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n').map((line) => line.split('=')))
    assert.deepEqual(values, { profile: 'full', core: 'true', full: 'true', containers: 'false' })
    const needs = statuses(planChecks({ eventName: 'push', profile: 'full', localContainers: false }))
    needs.scope.outputs = values
    execFileSync(process.execPath, [script, 'verify'], { env: { ...env, CI_RESULTS: JSON.stringify(needs) }, stdio: 'pipe' })
    needs.e2e.result = 'skipped'
    assert.throws(() => execFileSync(process.execPath, [script, 'verify'], {
      env: { ...env, CI_RESULTS: JSON.stringify(needs) }, stdio: 'pipe'
    }), (error) => error.status === 1 && /e2e: skipped/.test(error.stderr.toString()))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
