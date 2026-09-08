import { copyFile, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { createContext, requireDocker, root, withCleanup } from './ci-support.mjs'

// The Trivy engine matches the previously used trivy-action v0.36.0 default.
export const scanners = { gitleaks: 'zricethezav/gitleaks:v8.24.3', trivy: 'aquasec/trivy:0.70.0' }

export async function runScanner(execute, container) {
  await execute('docker', ['start', '--attach', container])
  const code = (await execute('docker', ['inspect', '--format', '{{.State.ExitCode}}', container], { quiet: true })).trim()
  if (code !== '0') throw new Error(`${container} scanner failed (exit ${code})`)
}

function assertInside(parent, target) {
  const path = relative(parent, target)
  if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Path escapes owned directory')
}

export async function snapshotTracked(execute, destination, repository = root) {
  const files = (await execute('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repository, quiet: true })).split('\0').filter(Boolean)
  for (const file of new Set(files)) {
    const source = resolve(repository, file)
    const target = resolve(destination, file)
    assertInside(repository, source)
    assertInside(destination, target)
    let info
    try { info = await lstat(source) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    await mkdir(dirname(target), { recursive: true })
    if (info.isSymbolicLink()) {
      const link = await readlink(source)
      if (isAbsolute(link)) throw new Error(`External tracked symlink: ${file}`)
      assertInside(repository, resolve(dirname(source), link))
      await symlink(link, target)
    } else if (info.isFile()) await copyFile(source, target)
    else throw new Error(`Unsupported tracked entry: ${file}`)
  }
}

export async function scanSecurity() {
  const context = await createContext('security')
  const { execute, reports, project } = context
  const snapshot = resolve(reports, 'snapshot')
  const history = resolve(reports, 'history.git')
  const names = []
  const scan = async (name, image, mounts, args) => {
    const container = `${project}-${name}`
    names.push(container)
    await execute('docker', ['create', '--name', container, '--label', `nebulynk.ci=${project}`,
      ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,source=${source},target=${target},readonly`]),
      '--mount', `type=bind,source=${reports},target=/reports`, image, ...args])
    await runScanner(execute, container)
  }
  try {
    await withCleanup(async () => {
      await requireDocker(execute)
      const shallow = (await execute('git', ['rev-parse', '--is-shallow-repository'], { quiet: true })).trim()
      if (shallow !== 'false') throw new Error('Secret scan requires full Git history. Run git fetch --unshallow --tags before retrying.')
      await mkdir(snapshot, { recursive: true })
      await snapshotTracked(execute, snapshot)
      await execute('git', ['clone', '--mirror', '--no-hardlinks', root, history], { quiet: true })
      const config = [resolve(snapshot, '.gitleaks.toml'), '/config/gitleaks.toml']
      const failures = []
      for (const check of [
        () => scan('gitleaks-history', scanners.gitleaks, [[history, '/history.git'], config], [
          'git', '/history.git', '--log-opts=--all', '--config=/config/gitleaks.toml', '--redact', '--exit-code=1', '--report-format=json', '--report-path=/reports/gitleaks-history.json'
        ]),
        () => scan('gitleaks-worktree', scanners.gitleaks, [[snapshot, '/source'], config], [
          'dir', '/source', '--config=/config/gitleaks.toml', '--redact', '--exit-code=1', '--report-format=json', '--report-path=/reports/gitleaks-worktree.json'
        ]),
        () => scan('trivy', scanners.trivy, [[snapshot, '/source']], [
          'fs', '--scanners', 'vuln,misconfig', '--severity', 'HIGH,CRITICAL', '--ignore-unfixed',
          '--exit-code', '1', '--timeout', '15m', '--format', 'json', '--output', '/reports/trivy.json', '/source'
        ])
      ]) {
        try { await check() } catch (error) { failures.push(error); console.error(error.message) }
        context.signal.throwIfAborted()
      }
      if (failures.length) throw new AggregateError(failures, 'Security scans failed; see redacted reports')
    }, async () => {
      const failures = []
      for (const name of names) {
        try {
          const owned = (await execute('docker', ['ps', '-a', '--filter', `name=^/${name}$`, '--filter', `label=nebulynk.ci=${project}`, '--format', '{{.Names}}'], { signal: undefined, quiet: true, timeout: 15000 })).trim()
          if (owned === name) await execute('docker', ['rm', '--force', name], { signal: undefined, timeout: 30000 })
        } catch (error) { failures.push(error) }
      }
      for (const directory of [snapshot, history]) {
        assertInside(reports, directory)
        try { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) } catch (error) { failures.push(error) }
      }
      if (failures.length) throw new AggregateError(failures, 'Scanner cleanup failed')
    })
  } finally { context.dispose() }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(root, 'scripts/run-ci-security.mjs')) {
  try { await scanSecurity() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
