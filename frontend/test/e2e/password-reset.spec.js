import { expect, test } from '@playwright/test'
import { ensureAdmin } from './bootstrap.js'

const runId = Date.now().toString(36)
const adminEmail = `password.reset.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Password Reset Admin'
const platformName = `Nebulynk Password Reset ${runId}`

test.describe('password reset request flow', () => {
  test('login screen links to the generic forgot-password request flow', async ({ page }) => {
    await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })

    await page.goto('/login')
    await expect(page.getByTestId('login-view')).toBeVisible()
    await page.getByTestId('login-forgot-password').click()
    await expect(page).toHaveURL(/\/forgot-password/)
    await expect(page.getByTestId('forgot-password-view')).toBeVisible()

    await page.getByTestId('forgot-password-email').fill('unknown@example.com')
    await page.getByTestId('forgot-password-submit').click()

    await expect(page.getByTestId('forgot-password-go-login')).toBeVisible()
    await expect(page.getByText(/If an eligible account exists/i)).toBeVisible()
  })
})
