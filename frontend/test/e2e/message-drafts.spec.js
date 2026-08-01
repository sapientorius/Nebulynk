import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { readSharedState, writeSharedState } from './shared-state.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `admin.drafts.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Draft Admin'
const platformName = `Nebulynk Drafts ${runId}`
let effectiveAdminEmail = adminEmail
let effectiveAdminPassword = adminPassword

async function waitForBootstrapView(page) {
  await expect.poll(async () => {
    if (await page.getByTestId('setup-view').isVisible().catch(() => false)) return 'setup'
    if (await page.getByTestId('login-view').isVisible().catch(() => false)) return 'login'
    return ''
  }, { timeout: 15_000 }).not.toBe('')

  if (await page.getByTestId('setup-view').isVisible().catch(() => false)) return 'setup'
  if (await page.getByTestId('login-view').isVisible().catch(() => false)) return 'login'
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

async function createTextChannel(page, accessToken, name) {
  const response = await page.request.post(resolveBackendUrl('/channels'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      name,
      type: 'public',
      description: ''
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Channel create failed (${response.status()}): ${responseText}`)
  }

  const channel = await response.json()
  if (!channel?.id) throw new Error('Channel create response did not include an id.')
  return channel
}

test.describe('message draft persistence', () => {
  test('restores per-channel text and pending files across reloads', async ({ page }) => {
    await ensureAdmin(page)
    await login(page)

    const adminAuth = await getAuthFromBrowserSession(page)
    const accessToken = adminAuth.accessToken
    expect(accessToken).toBeTruthy()

    const channelA = await createTextChannel(page, accessToken, `draft-a-${runId}`)
    const channelB = await createTextChannel(page, accessToken, `draft-b-${runId}`)

    await page.reload()
    await page.goto(`/channels/${channelA.id}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${channelA.id}$`))

    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeVisible()
    await input.fill(`Draft text ${runId}`)
    await page.locator('input[type="file"]').setInputFiles({
      name: `draft-${runId}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`draft attachment ${runId}`)
    })
    await expect(page.locator('.pending-file-name', { hasText: `draft-${runId}.txt` })).toBeVisible()

    await page.goto(`/channels/${channelB.id}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${channelB.id}$`))
    await expect(input).toHaveValue('')
    await input.fill(`Other channel ${runId}`)

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/channels/${channelB.id}$`))
    await expect(input).toHaveValue(`Other channel ${runId}`)

    await page.goto(`/channels/${channelA.id}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${channelA.id}$`))
    await expect(input).toHaveValue(`Draft text ${runId}`)
    await expect(page.locator('.pending-file-name', { hasText: `draft-${runId}.txt` })).toBeVisible()

    await input.press('Enter')
    await expect(page.locator('.message-content', { hasText: `Draft text ${runId}` })).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(page.locator('.pending-file-name', { hasText: `draft-${runId}.txt` })).toHaveCount(0)

    const channelADraft = await page.evaluate(({ channelId, userId }) => {
      const raw = localStorage.getItem(`nebulynk:message-drafts:v1:${userId}`)
      const drafts = raw ? JSON.parse(raw) : {}
      return drafts[channelId] || null
    }, {
      channelId: channelA.id,
      userId: adminAuth.user.id
    })
    expect(channelADraft).toBeNull()
  })
})
