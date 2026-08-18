import { expect, test } from '@playwright/test'
import { ensureAdmin } from './bootstrap.js'

const runId = Date.now().toString(36)
const adminCredentials = {
  platformName: `Nebulynk auth card ${runId}`,
  adminDisplayName: 'Auth Card Admin',
  adminEmail: `auth-card-admin.${runId}@example.com`,
  adminPassword: 'AuthCardPassw0rd!'
}

const enabledRegistrationConfig = {
  enabled: true,
  password_policy: {
    level: 'basic',
    min_length: 8,
    min_types: 2
  }
}

const disabledRegistrationConfig = {
  ...enabledRegistrationConfig,
  enabled: false
}

async function mockRegistrationConfig(page, config) {
  await page.route('**/self-registration**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config)
    })
  })
}

async function mockPlatformTheme(page, initialThemeMode = 'light') {
  let themeMode = initialThemeMode

  await page.route('**/platform**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()

    await route.fulfill({
      response,
      body: JSON.stringify({
        ...body,
        theme_mode_default: themeMode
      })
    })
  })

  return {
    setMode(mode) {
      themeMode = mode
    }
  }
}

async function expectRegistrationFace(page) {
  const inner = page.getByTestId('auth-flip-card').locator('.auth-flip-card__inner')
  await expect(inner).toHaveClass(/is-flipped/)
  await expect(page.getByTestId('auth-login-face')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByTestId('auth-register-face')).toHaveAttribute('aria-hidden', 'false')
  return inner
}

async function readAuthLabelColors(page, faceTestId) {
  return page.getByTestId(faceTestId).locator('.n-form-item-label').evaluateAll((elements) => (
    elements.map((element) => getComputedStyle(element).color)
  ))
}

async function readAuthViewport(page) {
  return page.getByTestId('login-view').evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight
  }))
}

async function expectAuthViewportToFit(page) {
  const viewport = await readAuthViewport(page)
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight + 1)
}

async function expectAuthViewportToStayFitted(page) {
  for (let sample = 0; sample < 4; sample += 1) {
    await expectAuthViewportToFit(page)
    await page.waitForTimeout(300)
  }
}

async function expectNoHorizontalAuthOverflow(page) {
  const viewport = await readAuthViewport(page)
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test.describe('login and registration flip card', () => {
  test('flips through the URL, supports direct registration, history, and reduced motion', async ({ page }) => {
    await ensureAdmin(page, adminCredentials)
    await mockRegistrationConfig(page, enabledRegistrationConfig)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/login')

    await expect(page.getByTestId('login-view')).toBeVisible()
    await expect(page.getByTestId('login-register')).toBeVisible()
    await expectAuthViewportToFit(page)

    const card = page.getByTestId('auth-flip-card')
    const cardBox = await card.boundingBox()
    const viewport = page.viewportSize()
    expect(cardBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(Math.abs(cardBox.x - (viewport.width - cardBox.width) / 2)).toBeLessThan(2)

    await page.getByTestId('login-register').click()
    await expect(page).toHaveURL(/\/register$/)
    const inner = await expectRegistrationFace(page)
    await expect.poll(() => inner.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('1.05s')
    await expect(page.getByTestId('self-registration-display-name')).toBeVisible()
    const registrationContent = page.getByTestId('self-registration-view').locator('.n-card__content').last()
    await expect.poll(() => registrationContent.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe('24px')
    await expectAuthViewportToStayFitted(page)

    await page.goBack()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('auth-login-face')).toHaveAttribute('aria-hidden', 'false')
    await expect(page.getByTestId('auth-register-face')).toHaveAttribute('aria-hidden', 'true')
    await expectAuthViewportToFit(page)

    await page.goForward()
    await expect(page).toHaveURL(/\/register$/)
    await expectRegistrationFace(page)
    await expectAuthViewportToFit(page)

    await page.goto('/register')
    await expectRegistrationFace(page)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/login')
    await page.getByTestId('login-register').click()
    await expectRegistrationFace(page)
    await expect.poll(() => inner.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')
  })

  test('keeps auth form labels consistent across light and dark platform themes', async ({ page }) => {
    await ensureAdmin(page, adminCredentials)
    await mockRegistrationConfig(page, enabledRegistrationConfig)
    const platformTheme = await mockPlatformTheme(page, 'light')

    await page.goto('/login')
    await expect(page.getByTestId('login-email')).toBeVisible()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('light')
    const lightLoginLabelColors = await readAuthLabelColors(page, 'auth-login-face')

    await page.getByTestId('login-register').click()
    await expectRegistrationFace(page)
    const lightRegistrationLabelColors = await readAuthLabelColors(page, 'auth-register-face')

    platformTheme.setMode('dark')
    await page.goto('/login')
    await expect(page.getByTestId('login-email')).toBeVisible()
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark')
    const darkLoginLabelColors = await readAuthLabelColors(page, 'auth-login-face')

    await page.getByTestId('login-register').click()
    await expectRegistrationFace(page)
    const darkRegistrationLabelColors = await readAuthLabelColors(page, 'auth-register-face')

    expect(darkLoginLabelColors).toEqual(lightLoginLabelColors)
    expect(darkRegistrationLabelColors).toEqual(lightRegistrationLabelColors)
    expect(lightRegistrationLabelColors[0]).toBe(lightLoginLabelColors[0])
  })

  test('keeps narrow auth layouts horizontally contained while allowing needed vertical scrolling', async ({ page }) => {
    await ensureAdmin(page, adminCredentials)
    await mockRegistrationConfig(page, enabledRegistrationConfig)
    await page.setViewportSize({ width: 390, height: 480 })
    await page.goto('/register')

    await expectRegistrationFace(page)
    await expect(page.getByTestId('self-registration-display-name')).toBeVisible()
    await expectNoHorizontalAuthOverflow(page)

    const viewport = await readAuthViewport(page)
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)

    const backToLogin = page.getByTestId('self-registration-back-login')
    await backToLogin.scrollIntoViewIfNeeded()
    await expect(backToLogin).toBeInViewport()
  })

  test('keeps the account link hidden but direct registration available when disabled', async ({ browser }) => {
    const page = await browser.newPage()
    await ensureAdmin(page, adminCredentials)
    await mockRegistrationConfig(page, disabledRegistrationConfig)

    await page.goto('/login')
    await expect(page.getByTestId('login-view')).toBeVisible()
    await expect(page.getByTestId('login-register')).toHaveCount(0)

    await page.goto('/register')
    await expectRegistrationFace(page)
    await expect(page.getByTestId('self-registration-disabled-login')).toBeVisible()

    await page.close()
  })
})
