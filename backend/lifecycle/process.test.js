import test from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { io } from 'socket.io-client'

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`Linux process handles ${signal} with an open socket`, async () => {
    assert.equal(process.platform, 'linux', 'Run process signal tests in the Linux test container')
    const child = fork(new URL('./process-fixture.mjs', import.meta.url), [], { silent: true })
    const exit = once(child, 'exit')
    const [ready] = await once(child, 'message')
    const socket = io(`http://127.0.0.1:${ready.port}`, { transports: ['websocket'], reconnection: false })
    await once(socket, 'connect')
    child.kill(signal)
    const [code, exitSignal] = await exit
    socket.disconnect()
    assert.equal(code, 0)
    assert.equal(exitSignal, null)
  })
}

test('blocked job reaches forced-exit deadline and is named in the log', async () => {
  const child = fork(new URL('./process-fixture.mjs', import.meta.url), ['--blocked'], { silent: true })
  let output = ''
  child.stderr.on('data', (chunk) => { output += chunk })
  const exit = once(child, 'exit')
  await once(child, 'message')
  const start = Date.now()
  child.kill('SIGTERM')
  const [code, signal] = await exit
  assert.equal(code, 1)
  assert.equal(signal, null)
  assert.ok(Date.now() - start >= 100)
  assert.ok(Date.now() - start < 3000)
  assert.match(output, /artificially-blocked-job/)
})
