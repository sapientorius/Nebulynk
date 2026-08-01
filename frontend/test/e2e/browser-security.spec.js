import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { ensureAdmin } from './bootstrap.js'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import {
  createBrowserSecurityMonitor,
  expectApiSecurityHeaders,
  expectFrontendSecurityHeaders
} from './security-helpers.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `browser.security.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Browser Security Admin'
const platformName = `Nebulynk Browser Security ${runId}`
const avatarFixturePath = fileURLToPath(new URL('../../src/assets/nebulynk.png', import.meta.url))
const uploadFileName = `browser-security-${runId}.txt`
const uploadFileBody = `Browser security upload ${runId}`

async function waitForBootstrapView(page) {
  await expect.poll(async () => {
    if (await page.getByTestId('setup-view').isVisible().catch(() => false)) {
      return 'setup'
    }

    if (await page.getByTestId('login-view').isVisible().catch(() => false)) {
      return 'login'
    }

    return ''
  }, { timeout: 15_000 }).not.toBe('')

  const setupVisible = await page.getByTestId('setup-view').isVisible().catch(() => false)
  if (setupVisible) {
    return 'setup'
  }

  const loginVisible = await page.getByTestId('login-view').isVisible().catch(() => false)
  if (loginVisible) {
    return 'login'
  }

  throw new Error('Neither setup nor login view became visible during bootstrap.')
}

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function resolveDefaultPublicChannelId(page, accessToken) {
  const response = await page.request.get(resolveBackendUrl('/channels?discover_public=true&$limit=100'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok()) {
    throw new Error(`Failed to resolve default channel (${response.status()})`)
  }

  const payload = await response.json()
  const channels = Array.isArray(payload) ? payload : payload?.data || []
  const defaultTextChannel = channels.find((channel) => !channel.is_voice && channel.purpose === 'default')
  const fallbackChannel = channels.find((channel) => !channel.is_voice) || channels[0]
  return (defaultTextChannel || fallbackChannel)?.id || null
}

async function fetchUserById(page, accessToken, userId) {
  const response = await page.request.get(resolveBackendUrl(`/users?ids[]=${encodeURIComponent(userId)}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Users lookup failed (${response.status()}): ${responseText}`)
  }

  const payload = await response.json()
  const users = Array.isArray(payload) ? payload : payload?.data || []
  return users[0] || null
}

async function createVoiceChannel(page, accessToken, name) {
  const response = await page.request.post(resolveBackendUrl('/channels'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      name,
      type: 'public',
      description: '',
      is_voice: true
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Voice channel create failed (${response.status()}): ${responseText}`)
  }

  return response.json()
}

test.describe('browser security validation', () => {
  test.describe.configure({ mode: 'serial' })

  test('frontend and api responses expose the expected security headers', async ({ page }) => {
    const security = await createBrowserSecurityMonitor(page)

    const frontendResponse = await page.goto('/login')
    expect(frontendResponse).toBeTruthy()
    expectFrontendSecurityHeaders(frontendResponse.headers())
    expect(['setup', 'login']).toContain(await waitForBootstrapView(page))

    const apiResponse = await page.request.get(resolveBackendUrl('/platform'))
    expect(apiResponse.ok()).toBe(true)
    expectApiSecurityHeaders(apiResponse.headers())

    await security.assertNoUnexpectedFindings()
  })

  test('markdown payloads stay inert under sanitization and CSP', async ({ page }) => {
    const security = await createBrowserSecurityMonitor(page)
    const admin = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })
    await login(page, admin)

    const authResult = await getAuthFromBrowserSession(page)
    const channelId = await resolveDefaultPublicChannelId(page, authResult.accessToken)
    expect(channelId).toBeTruthy()

    await page.goto(`/channels/${channelId}`)
    await page.evaluate(() => {
      window.__e2eXssExecutions = []
    })

    const xssPayload = [
      '**Security**',
      '<script>window.__e2eXssExecutions.push("script-tag")</script>',
      '<img src="x" onerror="window.__e2eXssExecutions.push(\'image-onerror\')">',
      '[evil](javascript:window.__e2eXssExecutions.push("js-link"))'
    ].join('\n')

    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeVisible()
    await input.fill(xssPayload)
    await input.press('Enter')

    const messageRow = page.locator('[data-message-id]').filter({ hasText: 'Security' }).last()
    await expect(messageRow).toBeVisible()

    const renderedHtml = await messageRow.locator('.message-body-content').innerHTML()
    expect(renderedHtml).not.toContain('<script')
    await expect(messageRow.locator('script')).toHaveCount(0)
    await expect(messageRow.locator('[onerror]')).toHaveCount(0)
    await expect(messageRow.locator('a[href^="javascript:"]')).toHaveCount(0)

    const xssExecutions = await page.evaluate(() => window.__e2eXssExecutions || [])
    expect(xssExecutions).toEqual([])

    await security.assertNoUnexpectedFindings()
  })

  test('avatar and signed file asset flows remain loadable without CSP regressions', async ({ page, context }) => {
    const security = await createBrowserSecurityMonitor(page)
    const admin = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })
    await login(page, admin)

    await page.getByTestId('open-user-menu').click()
    await page.getByTestId('user-menu-open-profile').click()
    await expect(page.getByTestId('user-profile-card')).toBeVisible()

    await page.getByTestId('profile-edit').click()
    await page.getByTestId('profile-avatar-input').setInputFiles(avatarFixturePath)
    await page.getByTestId('profile-avatar-crop-apply').click()
    await page.getByTestId('profile-save').click()

    const authResult = await getAuthFromBrowserSession(page)
    await expect.poll(async () => {
      const user = await fetchUserById(page, authResult.accessToken, authResult.user.id)
      return user?.avatar_url || null
    }).toMatch(/\/api\/users\/.+\/avatar\?v=/)

    const avatarUrl = (await fetchUserById(page, authResult.accessToken, authResult.user.id))?.avatar_url || null
    expect(avatarUrl).toBeTruthy()

    const avatarLoadResult = await page.evaluate(async ({ avatarUrl, accessToken, backendUrl }) => {
      try {
        const response = await fetch(`${backendUrl}${avatarUrl.replace(/^\/api/, '')}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })

        if (!response.ok) {
          return {
            ok: false,
            status: response.status
          }
        }

        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        const result = await new Promise((resolve) => {
          const image = new Image()
          image.onload = () => resolve({
            ok: true,
            width: image.naturalWidth,
            height: image.naturalHeight
          })
          image.onerror = () => resolve({ ok: false, error: 'image-error' })
          image.src = objectUrl
        })
        URL.revokeObjectURL(objectUrl)
        return result
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }, {
      avatarUrl,
      accessToken: authResult.accessToken,
      backendUrl: resolveBackendUrl('/')
        .replace(/\/$/, '')
    })

    expect(avatarLoadResult.ok).toBe(true)
    await expect.poll(async () => (
      await page.getByTestId('open-user-menu').locator('img').count()
    )).toBe(1)

    const defaultChannelId = await resolveDefaultPublicChannelId(page, authResult.accessToken)
    expect(defaultChannelId).toBeTruthy()

    await page.goto(`/channels/${defaultChannelId}`)
    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeVisible()
    await input.fill(`Security attachment ${runId}`)
    await page.locator('input[type="file"]').setInputFiles({
      name: uploadFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(uploadFileBody)
    })
    await expect(page.locator('.pending-file-name', { hasText: uploadFileName })).toBeVisible()
    await page.getByTestId('message-send-button').click()

    const fileCard = page.locator('.file-card').filter({
      has: page.locator('.file-card-name', { hasText: uploadFileName })
    }).last()
    await expect(fileCard).toBeVisible()

    const signedAssetUrl = await fileCard.getAttribute('href')
    expect(signedAssetUrl).toMatch(/^https?:\/\//)

    const directAssetResponse = await page.request.get(signedAssetUrl)
    expect(directAssetResponse.ok()).toBe(true)
    expect(await directAssetResponse.text()).toContain(uploadFileBody)

    const assetPage = await context.newPage()
    try {
      const assetResponse = await assetPage.goto(signedAssetUrl)
      expect(assetResponse?.ok()).toBe(true)
      const assetText = await assetPage.locator('body').textContent()
      expect(assetText || '').toContain(uploadFileBody)
    } finally {
      await assetPage.close()
    }

    await security.assertNoUnexpectedFindings()
  })

  test('fake livekit voice join and leave remain functional in the local security validation path', async ({ page }) => {
    const security = await createBrowserSecurityMonitor(page)
    const admin = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })
    await login(page, admin)

    const authResult = await getAuthFromBrowserSession(page)
    const voiceChannelName = `browser-security-voice-${runId}`
    await createVoiceChannel(page, authResult.accessToken, voiceChannelName)

    await page.reload()
    const voiceRow = page.locator('.voice-channel-item', { hasText: voiceChannelName }).first()
    await expect(voiceRow).toBeVisible()

    await voiceRow.locator('.voice-channel-name', { hasText: voiceChannelName }).click()
    await expect(page.getByTestId('voice-status-connected')).toBeVisible()
    await page.getByTestId('voice-leave').first().click()
    await expect(page.getByTestId('voice-controls')).toBeHidden()

    await security.assertNoUnexpectedFindings()
  })
})
