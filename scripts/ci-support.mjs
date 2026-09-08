import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

export const root = fileURLToPath(new URL('../', import.meta.url))

export function run(command, args, { cwd = root, env = process.env, signal, logFile, quiet = false, timeout = 0 } = {}) {
  return new Promise((resolveCommand, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const log = logFile ? createWriteStream(logFile, { flags: 'a' }) : null
    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let failure
    let killTimer
    const stop = () => {
      failure ||= signal?.reason || new Error(`${command} timed out`)
      if (!child.pid) return
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => child.kill())
      } else {
        try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill() }
        killTimer ||= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { /* Already exited. */ } }, 5000)
      }
    }
    const timer = timeout ? setTimeout(stop, timeout) : null
    signal?.addEventListener('abort', stop, { once: true })
    const collect = (stream) => (chunk) => {
      output += chunk
      log?.write(chunk)
      if (!quiet) stream.write(chunk)
    }
    child.stdout.on('data', collect(process.stdout))
    child.stderr.on('data', collect(process.stderr))
    child.on('error', (error) => { failure = error })
    child.on('close', (code, childSignal) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', stop)
      log?.end()
      if (failure || code !== 0) {
        reject(Object.assign(failure || new Error(`${command} exited ${code ?? childSignal}`), { code, output }))
      } else resolveCommand(output)
    })
  })
}

export function npm(script, options = {}) {
  const cli = process.env.npm_execpath || resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  return run(process.execPath, [cli, 'run', script], options)
}

export async function requireDocker(execute = run) {
  const os = (await execute('docker', ['info', '--format', '{{.OSType}}'], { quiet: true, timeout: 15000 })).trim()
  if (os !== 'linux') throw new Error('Full CI requires a running Linux Docker engine.')
  await execute('docker', ['compose', 'version'], { quiet: true, timeout: 15000 })
}

export async function waitFor(check, { timeout = 90000, interval = 500, signal } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    if (await check()) return
    await delay(interval, undefined, { signal })
  }
  throw new Error(`Service readiness timed out after ${timeout} ms`)
}

export async function freePort() {
  const server = net.createServer()
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const port = server.address().port
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()))
  return String(port)
}

// Application settings are deliberately not inherited by disposable test services.
export function testEnvironment(source = process.env) {
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|SYSTEMDRIVE|CI|GITHUB_ACTIONS|GITHUB_STEP_SUMMARY|PLAYWRIGHT_BROWSERS_PATH|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_CONFIG|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|npm_execpath)$/i
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)))
}

export async function withCleanup(work, cleanup) {
  let failure
  try { await work() } catch (error) { failure = error }
  try { await cleanup() } catch (error) {
    failure = failure ? new AggregateError([failure, error], 'CI failed and cleanup also failed') : error
  }
  if (failure) throw failure
}

export async function createContext(group, { execute: executeCommand = run } = {}) {
  if (!/^[a-z][a-z0-9]*$/.test(group)) throw new Error('Invalid CI group')
  const project = `nebulynk-ci-${group}-${randomBytes(6).toString('hex')}`
  const reports = resolve(root, 'output/ci', project)
  await mkdir(reports, { recursive: true })
  const emptyEnv = resolve(reports, 'empty.env')
  await writeFile(emptyEnv, '')
  const controller = new AbortController()
  const stop = () => controller.abort(new Error('CI interrupted; cleaning up owned resources'))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const execute = (command, args, options = {}) => executeCommand(command, args, {
    signal: controller.signal, logFile: resolve(reports, 'commands.log'), ...options
  })
  const compose = (args, options = {}) => execute('docker', [
    'compose', '--env-file', emptyEnv, '--project-name', project,
    '--file', resolve(root, 'scripts/ci-services.compose.yml'), ...args
  ], options)
  console.log(`CI ${group}: ${project}\nDiagnostics: ${reports}`)
  return { project, reports, emptyEnv, signal: controller.signal, execute, compose,
    dispose() { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop) }
  }
}
