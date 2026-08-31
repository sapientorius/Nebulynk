import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const testFile = fileURLToPath(new URL('./plesk-garage-integration.test.mjs', import.meta.url))
const child = spawn(process.execPath, ['--test', testFile], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLESK_GARAGE_INTEGRATION: '1'
  }
})

child.once('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : 1
  if (signal) {
    console.error(`Garage integration test terminated by ${signal}.`)
  }
})
