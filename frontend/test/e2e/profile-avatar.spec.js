import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { readSharedState, writeSharedState } from './shared-state.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `admin.avatar.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Avatar Admin'
const platformName = `Nebulynk Avatar ${runId}`
let effectiveAdminEmail = adminEmail
let effectiveAdminPassword = adminPassword

const avatarFixturePath = fileURLToPath(new URL('../../src/assets/nebulynk.png', import.meta.url))

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

async function ensureAdmin(page) {
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
    effectiveAdminEmail = adminEmail
    effectiveAdminPassword = adminPassword
    await writeSharedState({
      adminEmail: effectiveAdminEmail,
      adminPassword: effectiveAdminPassword
    })
    return
  }

  const sharedState = await readSharedState()
  if (!sharedState?.adminEmail || !sharedState?.adminPassword) {
    throw new Error('Platform is already initialized but shared admin credentials are missing.')
  }

  effectiveAdminEmail = sharedState.adminEmail
  effectiveAdminPassword = sharedState.adminPassword
}

async function login(page) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(effectiveAdminEmail)
  await page.getByTestId('login-password').fill(effectiveAdminPassword)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
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

test.describe('profile avatar flow', () => {
  test.describe.configure({ mode: 'serial' })

  test('user can upload and save a cropped avatar from the profile drawer', async ({ page }) => {
    await ensureAdmin(page)
    await login(page)

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

    const accessToken = authResult.accessToken
    const avatarUrl = (await fetchUserById(page, accessToken, authResult.user.id))?.avatar_url || null

    const avatarResponse = await page.request.get(
      `${resolveBackendUrl('/').replace(/\/$/, '')}${avatarUrl.replace(/^\/api/, '')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    expect(avatarResponse.ok()).toBe(true)
    expect(avatarResponse.headers()['content-type'] || '').toContain('image/webp')

    const browserFetchResult = await page.evaluate(async ({ avatarUrl, accessToken, backendBaseUrl }) => {
      try {
        const response = await fetch(`${backendBaseUrl}${avatarUrl.replace(/^\/api/, '')}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        })

        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type') || ''
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }, {
      avatarUrl,
      accessToken,
      backendBaseUrl: resolveBackendUrl('/').replace(/\/$/, '')
    })

    expect(browserFetchResult.ok).toBe(true)
    expect(browserFetchResult.contentType || '').toContain('image/webp')

    const browserImageLoadResult = await page.evaluate(async ({ avatarUrl, accessToken, backendBaseUrl }) => {
      try {
        const response = await fetch(`${backendBaseUrl}${avatarUrl.replace(/^\/api/, '')}`, {
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
      accessToken,
      backendBaseUrl: resolveBackendUrl('/').replace(/\/$/, '')
    })

    expect(browserImageLoadResult.ok).toBe(true)

    await expect.poll(async () => (
      await page.getByTestId('open-user-menu').locator('img').count()
    )).toBe(1)
  })

  test('user can take a webcam avatar photo and save it through the crop flow', async ({ page }) => {
    await ensureAdmin(page)
    await login(page)

    await page.getByTestId('open-user-menu').click()
    await page.getByTestId('user-menu-open-profile').click()
    await expect(page.getByTestId('user-profile-card')).toBeVisible()

    await page.getByTestId('profile-edit').click()
    await page.getByTestId('profile-avatar-camera-open').click()
    await expect(page.getByTestId('profile-avatar-camera-video')).toBeVisible()
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-testid="profile-avatar-camera-video"]')
      return video && video.videoWidth > 0 && video.videoHeight > 0
    })

    await page.getByTestId('profile-avatar-camera-capture').click()
    await page.getByTestId('profile-avatar-crop-apply').click()
    await page.getByTestId('profile-save').click()

    const webcamAuth = await getAuthFromBrowserSession(page)

    await expect.poll(async () => {
      const user = await fetchUserById(page, webcamAuth.accessToken, webcamAuth.user.id)
      return user?.avatar_url || null
    }).toMatch(/\/api\/users\/.+\/avatar\?v=/)

    const accessToken = webcamAuth.accessToken
    const avatarUrl = (await fetchUserById(page, accessToken, webcamAuth.user.id))?.avatar_url || null

    const avatarResponse = await page.request.get(
      `${resolveBackendUrl('/').replace(/\/$/, '')}${avatarUrl.replace(/^\/api/, '')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    expect(avatarResponse.ok()).toBe(true)
    expect(avatarResponse.headers()['content-type'] || '').toContain('image/webp')
  })
})
