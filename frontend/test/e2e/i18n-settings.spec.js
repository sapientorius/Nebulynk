import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { readSharedState, writeSharedState } from './shared-state.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `admin.i18n.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'I18N Admin'
const platformName = `Nebulynk I18N ${runId}`
const inviteEmail = `member.i18n.${runId}@example.com`
const invitePassword = 'MemberPassw0rd!'
const inviteDisplayName = 'I18N Member'
let effectiveAdminEmail = adminEmail
let effectiveAdminPassword = adminPassword

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

test.describe('i18n defaults and user locale', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup uses english as default language before explicit selection', async ({ page }) => {
    await page.goto('/setup')
    const setupVisible = await page.getByTestId('setup-view')
      .isVisible({ timeout: 1500 })
      .catch(() => false)

    if (setupVisible) {
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
    } else {
      const sharedState = await readSharedState()
      if (!sharedState?.adminEmail || !sharedState?.adminPassword) {
        throw new Error('Platform is already initialized but shared admin credentials are missing.')
      }
      effectiveAdminEmail = sharedState.adminEmail
      effectiveAdminPassword = sharedState.adminPassword
    }

    const platformResponse = await page.request.get(resolveBackendUrl('/platform'))
    if (!platformResponse.ok()) {
      const responseText = await platformResponse.text()
      throw new Error(`Platform API failed (${platformResponse.status()}): ${responseText}`)
    }
    const platform = await platformResponse.json()
    expect(platform.default_locale).toBe('en')
  })

  test('admin can change default language and invited users inherit it', async ({ page, context }) => {
    await login(page, {
      email: effectiveAdminEmail,
      password: effectiveAdminPassword
    })

    const adminAuth = await getAuthFromBrowserSession(page)
    const accessToken = adminAuth.accessToken
    expect(accessToken).toBeTruthy()

    const patchResponse = await page.request.patch(resolveBackendUrl('/platform'), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      data: {
        defaultLanguage: 'de'
      }
    })

    if (!patchResponse.ok()) {
      const responseText = await patchResponse.text()
      throw new Error(`Platform patch failed (${patchResponse.status()}): ${responseText}`)
    }

    const platformResponse = await page.request.get(resolveBackendUrl('/platform'))
    const platform = await platformResponse.json()
    expect(platform.default_locale).toBe('de')

    const inviteResponse = await page.request.post(resolveBackendUrl('/invites'), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      data: {
        email: inviteEmail,
        role_to_assign: 'platform:member',
        message: 'I18N default locale check',
        expires_in: 7 * 24 * 60 * 60 * 1000
      }
    })

    if (!inviteResponse.ok()) {
      const responseText = await inviteResponse.text()
      throw new Error(`Invite API failed (${inviteResponse.status()}): ${responseText}`)
    }

    const invite = await inviteResponse.json()
    const inviteUrl = invite.invite_url || `${new URL(page.url()).origin}/invite/${invite.token}`

    const invitePage = await context.newPage()
    await invitePage.goto(inviteUrl)
    await expect(invitePage.getByTestId('invite-accept-view')).toBeVisible()

    await invitePage.getByTestId('invite-display-name').fill(inviteDisplayName)
    await invitePage.getByTestId('invite-password').fill(invitePassword)
    await invitePage.getByTestId('invite-password-confirm').fill(invitePassword)
    await invitePage.getByTestId('invite-accept-submit').click()

    await expect(invitePage.getByTestId('invite-success-go-login')).toBeVisible()
    await invitePage.getByTestId('invite-success-go-login').click()

    await login(invitePage, {
      email: inviteEmail,
      password: invitePassword
    })

    const invitedAuth = await getAuthFromBrowserSession(invitePage)
    const invitedUser = invitedAuth.user

    expect(invitedUser?.preferred_locale).toBe('de')
    await expect(invitePage.locator('html')).toHaveAttribute('lang', 'de')
  })
})
