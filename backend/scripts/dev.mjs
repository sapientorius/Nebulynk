import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backendRoot = fileURLToPath(new URL('../', import.meta.url))
const tasks = [
  { name: 'Backend API', args: ['--watch', 'src/index.js'] },
  { name: 'Transcription worker', args: ['--watch', 'src/transcription-worker.js'] }
]

const children = []
let stopping = false

function stop(code) {
  if (stopping) {
    if (code !== 0) {
      process.exitCode = code
    }
    return
  }

  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
}

for (const task of tasks) {
  const child = spawn(process.execPath, task.args, {
    cwd: backendRoot,
    stdio: 'inherit',
    windowsHide: true
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(`${task.name} failed to start: ${error.message}`)
    stop(1)
  })
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${task.name} exited${signal ? ` after ${signal}` : ` with code ${code}`}`)
      stop(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : (code || 1))
    }
  })
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0))
}
