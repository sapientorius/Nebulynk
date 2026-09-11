import { chromium, expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { join } from 'node:path'
import { readSharedState } from './shared-state.js'
import { loginViaApi } from './auth-helpers.js'
import { frontendUrl, resolveBackendUrl } from './test-urls.js'

async function login(page, email, password) {
  await page.goto(new URL('/login', frontendUrl).href)
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-password').press('Enter')
  await expect(page).toHaveURL(/\/channels\/[^/?#]+$/)
  await expect(page.getByTestId('message-input-textarea')).toBeVisible()
}

async function openNativeRecipient(testInfo) {
  const profile = testInfo.outputPath('recipient-profile')
  await mkdir(profile, { recursive: true })
  // Attaching with noDefaults avoids Playwright's per-session focus/visibility
  // override entirely. No autoplay or background-throttling flags are supplied.
  const browserProcess = spawn(chromium.executablePath(), [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore', windowsHide: false })
  let browser
  try {
    let port
    for (let attempt = 0; attempt < 80; attempt++) {
      try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) }
      catch { /* Chromium has not written its debugging endpoint yet. */ }
      if (port) break
      await setTimeout(100)
    }
    if (!port) throw new Error('Native recipient browser did not start')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true })
    return { context: browser.contexts()[0], close: async () => { await browser.close(); browserProcess.kill() } }
  } catch (error) {
    await browser?.close()
    browserProcess.kill()
    throw error
  }
}

// Continuous screenshot/video capture can keep minimized Chromium pages visible.
test.use({ headless: false, video: 'off', trace: 'off', launchOptions: {
  ignoreDefaultArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
} })

test.describe('background ringing with normal browser policies', () => {
  test.skip(process.platform === 'linux' && !process.env.DISPLAY, 'Window-focus tests require a desktop or xvfb-run on Linux.')
  for (const mode of ['unfocused', 'minimized', 'hidden-tab']) {
    test(`rings with ${mode} without recipient interaction`, async ({ page, browser }, testInfo) => {
      const loseEvents = mode !== 'unfocused'
      const credentials = await readSharedState()
      await login(page, credentials.adminEmail, credentials.adminPassword)
      const recipientBrowser = mode === 'hidden-tab'
        ? await openNativeRecipient(testInfo)
        : await browser.newContext({ baseURL: new URL(page.url()).origin }).then(context => ({ context, close: () => context.close() }))
      const context = recipientBrowser.context
      try {
        const recipient = context.pages()[0] || await context.newPage()
        await recipient.addInitScript(() => {
          window.__ringStarts = []
          const start = AudioBufferSourceNode.prototype.start
          AudioBufferSourceNode.prototype.start = function (...args) {
            window.__ringStarts.push({ state: this.context.state, focused: document.hasFocus(), visibility: document.visibilityState })
            return start.apply(this, args)
          }
        })
        let events = 0
        await recipient.routeWebSocket(/socket\.io\//, socket => {
          const server = socket.connectToServer()
          server.onMessage(message => {
            const payload = message.toString()
            if (payload.includes('meeting-calls changed')) events++
            // Also exercise background polling when both discovery hints are lost.
            if (loseEvents && (payload.includes('meeting-calls changed') || payload.includes('meeting_call'))) return
            socket.send(message)
          })
        })
        await recipient.bringToFront()
        await login(recipient, credentials.inviteEmail, credentials.invitePassword)
        const cdp = await context.newCDPSession(recipient)
        if (mode !== 'hidden-tab') await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
        const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
        const member = await loginViaApi(recipient.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
        const response = await page.request.post(resolveBackendUrl('/dms'), {
          headers: { Authorization: `Bearer ${admin.accessToken}` }, data: { user_ids: [member.user.id] }
        })
        expect(response.ok()).toBe(true)
        const dm = await response.json()
        await page.goto(`/channels/${dm.id}`)
        await page.bringToFront()
        if (mode === 'minimized') {
          const { targetInfo } = await cdp.send('Target.getTargetInfo')
          const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId })
          await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })
          expect((await cdp.send('Browser.getWindowBounds', { windowId })).bounds.windowState).toBe('minimized')
        }
        if (mode === 'hidden-tab') {
          const foregroundTab = await context.newPage()
          await foregroundTab.goto('about:blank')
          await foregroundTab.bringToFront()
          await expect.poll(() => recipient.evaluate(() => document.visibilityState)).toBe('hidden')
        }
        if (mode !== 'hidden-tab') await expect.poll(() => recipient.evaluate(() => document.hasFocus())).toBe(false)
        const soundCount = await recipient.evaluate(() => window.__ringStarts.length)
        await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
        await expect(recipient.getByTestId('incoming-meeting-call')).toBeVisible({ timeout: loseEvents ? 7000 : 2000 })
        expect(events).toBeGreaterThan(0)
        await expect.poll(() => recipient.evaluate(({ count, hidden }) => window.__ringStarts.slice(count)
          .some(sound => sound.state === 'running' && (hidden ? sound.visibility === 'hidden' : !sound.focused)),
        { count: soundCount, hidden: mode === 'hidden-tab' })).toBe(true)
        await page.getByTestId('outgoing-call').getByRole('button', { name: /^Cancel$|^Abbrechen$/ }).click()
        await expect(recipient.getByTestId('incoming-meeting-call')).toHaveCount(0)
      } finally {
        await recipientBrowser.close()
      }
    })
  }
})
