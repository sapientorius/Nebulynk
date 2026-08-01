import { expect } from '@playwright/test'
import { readSharedState, writeSharedState } from './shared-state.js'

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

  if (await page.getByTestId('setup-view').isVisible().catch(() => false)) {
    return 'setup'
  }

  if (await page.getByTestId('login-view').isVisible().catch(() => false)) {
    return 'login'
  }

  throw new Error('Neither setup nor login view became visible during app bootstrap.')
}

export async function ensureAdmin(page, {
  platformName,
  adminDisplayName,
  adminEmail,
  adminPassword
}) {
  await page.goto('/setup')
  const bootstrapView = await waitForBootstrapView(page)

  if (bootstrapView === 'setup') {
    await page.getByTestId('setup-platform-name').fill(platformName)
    await page.getByTestId('setup-next').click()
    await page.getByTestId('setup-display-name').fill(adminDisplayName)
    await page.getByTestId('setup-email').fill(adminEmail)
    await page.getByTestId('setup-password').fill(adminPassword)
    await page.getByTestId('setup-submit').click()
    await expect(page.getByTestId('setup-go-login')).toBeVisible()

    await writeSharedState({
      adminEmail,
      adminPassword
    })

    return {
      email: adminEmail,
      password: adminPassword
    }
  }

  const sharedState = await readSharedState()
  if (!sharedState?.adminEmail || !sharedState?.adminPassword) {
    throw new Error('Platform is already initialized but shared admin credentials are missing.')
  }

  return {
    email: sharedState.adminEmail,
    password: sharedState.adminPassword
  }
}
