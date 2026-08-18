import { expect, test } from '@playwright/test'
import { ensureAdmin } from './bootstrap.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `klipy.settings.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Klipy Settings Admin'
const platformName = `Nebulynk Klipy Settings ${runId}`

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function stubKlipyStatus(page) {
  let configured = false

  await page.route(`${resolveBackendUrl('/platform')}*`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    const response = await route.fetch()
    const payload = await response.json()
    await route.fulfill({
      status: response.status(),
      contentType: 'application/json',
      body: JSON.stringify({ ...payload, klipy_configured: configured })
    })
  })

  return {
    setConfigured(value) {
      configured = value === true
    }
  }
}

test('hides the GIF button without Klipy and shows it after configuration is reported', async ({ page }) => {
  const admin = await ensureAdmin(page, {
    platformName,
    adminDisplayName,
    adminEmail,
    adminPassword
  })
  const klipyStatus = await stubKlipyStatus(page)

  await login(page, admin)
  await expect(page.getByTestId('message-input')).toBeVisible()
  await expect(page.getByTestId('message-gif-button')).toHaveCount(0)

  klipyStatus.setConfigured(true)
  await page.reload()
  await expect(page.getByTestId('app-view')).toBeVisible()
  await expect(page.getByTestId('message-input')).toBeVisible()
  await expect(page.getByTestId('message-gif-button')).toBeVisible()
})
