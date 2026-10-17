import assert from 'node:assert/strict'
import http from 'node:http'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createContext, freePort, requireDocker, root, testEnvironment, waitFor, withCleanup } from './ci-support.mjs'

const context = await createContext('containers')
const { project, reports, compose } = context
const env = testEnvironment()
const docker = (args, options = {}) => context.execute('docker', args, { env, quiet: true, timeout: 120000, ...options })
const names = []
const built = []
let browser
let started = false
let proxy

function createProxy(frontend, backend) {
  const server = http.createServer((request, response) => {
    const api = request.url.startsWith('/api/') || request.url.startsWith('/socket.io/')
    const target = new URL(api ? backend : frontend)
    const upstream = http.request({ hostname: target.hostname, port: target.port,
      path: request.url.replace(/^\/api(?=\/)/, ''), method: request.method, headers: request.headers }, (result) => {
      response.writeHead(result.statusCode, result.headers)
      result.pipe(response)
    })
    upstream.on('error', () => { response.writeHead(502); response.end() })
    request.pipe(upstream)
  })
  server.on('upgrade', (request, socket, head) => {
    const target = new URL(backend)
    const upstream = http.request({ hostname: target.hostname, port: target.port, path: request.url, headers: request.headers })
    upstream.on('upgrade', (response, peer, peerHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`)
      if (head.length) peer.write(head)
      if (peerHead.length) socket.write(peerHead)
      socket.pipe(peer).pipe(socket)
      socket.on('error', () => peer.destroy())
      peer.on('error', () => socket.destroy())
      socket.on('close', () => peer.destroy())
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  })
  return server
}

async function start(name, args) {
  names.push(name)
  await docker(['run', '-d', '--name', name, '--label', `nebulynk.ci=${project}`, ...args])
}

async function ready(origin, path = '/healthz') {
  await waitFor(async () => {
    try { return (await fetch(origin + path, { signal: AbortSignal.timeout(2000) })).ok } catch { return false }
  }, { signal: context.signal, timeout: 120000 })
}

async function login(page, origin) {
  await page.goto(`${origin}/login`)
  await expect(page.getByTestId('login-view')).toBeVisible()
  await expect.poll(async () =>
    await page.getByTestId('login-email').isVisible() || await page.getByTestId('login-active-session').isVisible()
  ).toBe(true)
  if (await page.getByTestId('login-active-session').isVisible()) await page.getByTestId('login-session-logout').click()
  await page.getByTestId('login-email').fill('containers@example.com')
  await page.getByTestId('login-password').fill('Containers-Test-2026!')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels\/[^/?#]+$/, { timeout: 30000 })
  await expect(page.getByTestId('message-input-textarea')).toBeVisible({ timeout: 30000 })
  const close = page.getByRole('button', { name: 'Close', exact: true })
  try { await close.waitFor({ state: 'visible', timeout: 1500 }); await close.click() } catch { /* Owner sponsorship is shown once. */ }
}

try {
  await withCleanup(async () => {
    await requireDocker(context.execute)
    const images = {}
    for (const component of ['backend', 'frontend', 'transcription-worker']) {
      const key = { backend: 'NEBULYNK_TEST_BACKEND_IMAGE', frontend: 'NEBULYNK_TEST_FRONTEND_IMAGE', 'transcription-worker': 'NEBULYNK_TEST_WORKER_IMAGE' }[component]
      images[component] = process.env[key] || `${project}-${component}:test`
      if (!process.env[key]) {
        built.push(images[component])
        await docker(['build', '--file', component === 'frontend' ? 'frontend/Dockerfile' : 'backend/Dockerfile',
          '--target', component === 'frontend' ? 'production-stage' : component, '--tag', images[component], root], { quiet: false, timeout: 900000 })
      }
      const [image] = JSON.parse(await docker(['image', 'inspect', images[component]]))
      assert.notEqual(image.Config.User, '0')
      assert.notEqual(image.Config.User, 'root')
      assert.ok(image.Config.User)
      assert.ok(image.Config.Healthcheck)
      await docker(['run', '--rm', '--entrypoint', 'node', images[component], '-e',
        "require('fs').accessSync('/licenses/LICENSE')"
      ])
      if (component !== 'frontend') {
        await docker(['run', '--rm', '-e', 'NEBULYNK_BUILD_SHA=obsolete-source-commit', '-e', 'NEBULYNK_BUILD_TIME=obsolete-source-date',
          '--entrypoint', 'node', images[component], '--input-type=module', '-e',
          "import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{getPlatformBuildInfo}from'./src/lib/build-info.js';const baked=JSON.parse(readFileSync('container-build-info.json'));assert.equal(getPlatformBuildInfo().sha,baked.sha);assert.equal(getPlatformBuildInfo().built_at,baked.built_at)"
        ])
      }
    }
    await docker(['run', '--rm', '--entrypoint', 'node', images.backend, '--input-type=module', '-e',
      "import sharp from 'sharp';await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer()"
    ])
    await docker(['run', '--rm', '--entrypoint', 'ffmpeg', images['transcription-worker'], '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-f', 'null', '-'])
    started = true
    await compose(['up', '--detach', '--wait', '--wait-timeout', '120', 'postgres', 'redis', 'garage'], { env })
    const backendPort = await freePort()
    const frontendPort = await freePort()
    const secondPort = await freePort()
    const apiOrigin = `http://127.0.0.1:${backendPort}`
    const firstOrigin = `http://127.0.0.1:${frontendPort}`
    const secondFrontend = `http://127.0.0.1:${secondPort}`
    proxy = createProxy(secondFrontend, apiOrigin)
    await new Promise((accept) => proxy.listen(0, '127.0.0.1', accept))
    const sameOrigin = `http://127.0.0.1:${proxy.address().port}`
    const shared = [
      '--network', `${project}_default`, '-e', 'NODE_ENV=test',
      '-e', 'POSTGRES_HOST=postgres', '-e', 'POSTGRES_PORT=5432', '-e', 'POSTGRES_DB=postgres',
      '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_PASSWORD=isolated-ci-password',
      '-e', 'REDIS_HOST=redis', '-e', 'RATE_LIMIT_DRIVER=redis', '-e', 'JWT_SECRET=isolated-container-jwt',
      '-e', 'AI_SECRET_KEY=isolated-container-ai', '-e', 'AUTH_CSRF_COOKIE_NAME=container_csrf',
      '-e', `FRONTEND_URL=${firstOrigin},${sameOrigin}`, '-e', 'AUTHENTICATION_RATE_LIMIT_IP_LIMIT=10000',
      '-e', 'STORAGE_S3_ENDPOINT=http://garage:3900', '-e', 'STORAGE_S3_ACCESS_KEY=nebulynk',
      '-e', 'STORAGE_S3_SECRET_KEY=integration-storage-secret', '-e', 'STORAGE_S3_BUCKET=nebulynk-files',
      '-e', 'LIVEKIT_HOST=http://127.0.0.1:9', '-e', 'LIVEKIT_API_KEY=isolated-ci',
      '-e', 'LIVEKIT_API_SECRET=isolated-container-livekit', '-e', 'LIVEKIT_PUBLIC_URL=wss://calls.example.com'
    ]
    const apiName = `${project}-backend`
    await start(apiName, [...shared, '-p', `127.0.0.1:${backendPort}:3030`, images.backend])
    await ready(apiOrigin, '/health/ready')
    await start(`${project}-worker`, [...shared, images['transcription-worker']])
    await waitFor(async () => {
      try { await docker(['exec', `${project}-worker`, 'node', 'src/transcription-worker-health.js']); return true } catch { return false }
    }, { timeout: 45000 })
    for (const [name, port, api, calls, push] of [
      [`${project}-frontend`, frontendPort, apiOrigin, 'wss://calls.example.com', 'first-public-key'],
      [`${project}-frontend-relative`, secondPort, '/api', 'https://other-calls.example.com/livekit', '']
    ]) {
      await start(name, ['--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '-p', `127.0.0.1:${port}:8080`,
        '-e', `API_URL=${api}`, '-e', `LIVEKIT_URL=${calls}`, '-e', `VAPID_PUBLIC_KEY=${push}`,
        '-e', 'AUTH_CSRF_COOKIE_NAME=container_csrf', '-e', 'JWT_SECRET=must-not-be-public', images.frontend])
      const origin = `http://127.0.0.1:${port}`
      await ready(origin)
      const config = await fetch(`${origin}/runtime-config.js`)
      assert.equal(config.headers.get('cache-control'), 'no-store')
      assert.match(config.headers.get('content-security-policy'), /wasm-unsafe-eval/)
      const source = await config.text()
      assert.ok(source.includes(api))
      assert.ok(!source.includes('must-not-be-public'))
      const html = await fetch(origin)
      assert.equal(html.headers.get('cache-control'), 'no-store')
      assert.ok(html.headers.get('content-security-policy').includes(new URL(calls.replace(/^wss:/, 'https:')).hostname))
      const markup = await html.text()
      const asset = markup.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
      assert.ok(asset, 'The production HTML must load a hashed application asset')
      const javascript = await fetch(origin + asset)
      assert.equal(javascript.status, 200)
      assert.match(javascript.headers.get('cache-control'), /max-age=31536000, immutable/)
      assert.equal(javascript.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(javascript.headers.get('content-security-policy'), html.headers.get('content-security-policy'))
    }
    browser = await chromium.launch()
    const page = await browser.newPage()
    const violations = []
    page.on('console', (message) => { if (/violates.*Content Security Policy/i.test(message.text())) violations.push(message.text()) })
    await page.goto(`${firstOrigin}/setup`)
    await page.getByTestId('setup-platform-name').fill('Container verification')
    await page.getByTestId('setup-next').click()
    await page.getByTestId('setup-display-name').fill('Container admin')
    await page.getByTestId('setup-email').fill('containers@example.com')
    await page.getByTestId('setup-password').fill('Containers-Test-2026!')
    await page.getByTestId('setup-submit').click()
    await expect(page.getByTestId('setup-go-login')).toBeVisible({ timeout: 30000 })
    const sockets = []
    page.on('websocket', (socket) => sockets.push(socket.url()))
    await login(page, firstOrigin)
    const channelPath = new URL(page.url()).pathname
    const message = `container-${project}`
    await page.getByTestId('message-input-textarea').fill(message)
    const [sent] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/messages') && response.request().method() === 'POST'),
      page.getByTestId('message-input-textarea').press('Enter')
    ])
    assert.ok(sent.ok(), await sent.text())
    await expect(page.locator('.message-content', { hasText: message })).toBeVisible({ timeout: 15000 })
    await waitFor(() => sockets.some((url) => url.startsWith(apiOrigin.replace('http:', 'ws:'))))
    assert.equal(await page.evaluate(() => globalThis.__NEBULYNK_CONFIG__.apiUrl), apiOrigin)
    const file = `container-${project}.txt`
    const [uploaded] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/upload') && response.request().method() === 'POST'),
      page.locator('.file-upload input[type="file"]').setInputFiles({ name: file, mimeType: 'text/plain', buffer: Buffer.from(message) })
    ])
    assert.ok(uploaded.ok(), await uploaded.text())
    await expect(page.locator('.pending-file-name', { hasText: file })).toBeVisible()
    // No external provider call: the real worker sends its encoded audio to this isolated mock.
    const providerName = `${project}-provider`
    await start(providerName, ['--network', `${project}_default`, '--entrypoint', 'node', images.backend, '--input-type=module', '-e',
      "import http from 'node:http';http.createServer(async(req,res)=>{const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);const valid=req.url==='/v1/audio/transcriptions'&&req.headers.authorization==='Bearer isolated-provider-key'&&body.includes(Buffer.from('OggS'));res.writeHead(valid?200:400,{'content-type':'application/json'});res.end(JSON.stringify({language:'en',text:'Container transcript succeeded',segments:[{start:0,end:1,text:'Container transcript succeeded'}]}));}).listen(9999,'0.0.0.0')"
    ])
    const workerName = `${project}-worker`
    await docker(['cp', resolve(root, 'scripts/fixtures/container-transcription.mjs'), `${workerName}:/app/backend/container-transcription-fixture.mjs`])
    await docker(['exec', '-e', `MOCK_PROVIDER_ORIGIN=http://${providerName}:9999/v1`, workerName, 'node', 'container-transcription-fixture.mjs', 'seed'])
    await waitFor(async () => {
      try { await docker(['exec', workerName, 'node', 'container-transcription-fixture.mjs', 'verify']); return true } catch { return false }
    }, { signal: context.signal, timeout: 90000 })
    await page.context().clearCookies()
    await page.goto(sameOrigin)
    await login(page, sameOrigin)
    await page.goto(`${sameOrigin}${channelPath}`)
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 15000 })
    assert.equal(await page.evaluate(() => globalThis.__NEBULYNK_CONFIG__.apiUrl), '/api')
    assert.equal(await page.evaluate(() => globalThis.__NEBULYNK_CONFIG__.vapidPublicKey), '')
    await waitFor(() => sockets.some((url) => url.startsWith(sameOrigin.replace('http:', 'ws:'))))
    // Recreate the backend over the same database, proving persistent upgrade state.
    await docker(['rm', '--force', apiName])
    await start(apiName, [...shared, '-p', `127.0.0.1:${backendPort}:3030`, images.backend])
    await ready(apiOrigin, '/health/ready')
    await login(page, sameOrigin)
    await page.goto(`${sameOrigin}${channelPath}`)
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 15000 })
    assert.deepEqual(violations, [])
    await docker(['restart', `${project}-frontend-relative`])
    await ready(secondFrontend)
    assert.ok((await (await fetch(`${secondFrontend}/runtime-config.js`)).text()).includes('"apiUrl":"/api"'))
    const invalid = `${project}-invalid`
    await start(invalid, ['--read-only', '--tmpfs', '/tmp:rw,size=64m', images.frontend])
    await waitFor(async () => (await docker(['inspect', '--format', '{{.State.Running}}', invalid])).trim() === 'false')
    assert.notEqual((await docker(['inspect', '--format', '{{.State.ExitCode}}', invalid])).trim(), '0')
    await writeFile(resolve(reports, 'result.json'), JSON.stringify({ status: 'passed', images }, null, 2))
    console.log('Production images: runtime configuration, CSP, non-root/read-only startup, native dependencies, real worker transcription, browser login/chat/sockets/uploads and persistent recreation passed')
  }, async () => {
    await browser?.close()
    if (proxy) { proxy.closeAllConnections(); await new Promise((accept) => proxy.close(accept)) }
    for (const name of new Set(names)) {
      try {
        const logs = await docker(['logs', name], { signal: undefined })
        await writeFile(resolve(reports, `${name}.log`), logs)
        await docker(['rm', '--force', name], { signal: undefined })
      } catch { /* A failed start may not have created a container. */ }
    }
    if (started) await compose(['down', '--volumes', '--remove-orphans'], { env, signal: undefined, timeout: 120000 })
    for (const image of built) { try { await docker(['image', 'rm', image], { signal: undefined }) } catch { /* Best effort image cache cleanup. */ } }
  })
} finally { context.dispose() }
