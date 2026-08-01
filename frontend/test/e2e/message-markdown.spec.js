import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { ensureAdmin } from './bootstrap.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `markdown.admin.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Markdown Admin'
const platformName = `Nebulynk Markdown ${runId}`

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

test.describe('message markdown e2e', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup and render markdown messages', async ({ page }) => {
    const admin = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })
    await login(page, admin)

    const authResult = await getAuthFromBrowserSession(page)
    const accessToken = authResult.accessToken
    expect(accessToken).toBeTruthy()
    const channelId = await resolveDefaultPublicChannelId(page, accessToken)
    expect(channelId).toBeTruthy()

    await page.goto(`/channels/${channelId}`)
    await expect(page.getByTestId('message-markdown-toolbar')).toBeVisible()

    const markdownMessage = '**Ship**\n- [x] Docs\n\n`npm run build`'
    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeVisible()
    await input.fill(markdownMessage)
    await input.press('Enter')

    const messageRow = page.locator('[data-message-id]').filter({ hasText: 'Ship' }).last()
    await expect(messageRow.locator('.message-content strong').filter({ hasText: 'Ship' })).toBeVisible()
    await expect(messageRow.locator('.message-content .task-list-item')).toContainText('Docs')
    await expect(messageRow.locator('.message-content code').filter({ hasText: 'npm run build' })).toBeVisible()
  })
})
