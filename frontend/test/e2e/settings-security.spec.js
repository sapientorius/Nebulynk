import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { ensureAdmin } from './bootstrap.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `settings.security.admin.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Settings Security Admin'
const platformName = `Nebulynk Settings Security ${runId}`
const memberEmail = `settings.security.member.${runId}@example.com`
const memberPassword = 'MemberPassw0rd!'
const updatedMemberPassword = 'MemberPassw0rd!2'
const memberDisplayName = 'Settings Security Member'

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function openUserMenu(page) {
  await page.getByTestId('open-user-menu').click()
  return page.getByTestId('user-menu-panel')
}

test.describe('settings security password change', () => {
  test('member can change the password from Settings -> Security', async ({ page, context }) => {
    const adminCredentials = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })

    await login(page, adminCredentials)
    const adminAuth = await getAuthFromBrowserSession(page)
    const accessToken = adminAuth?.accessToken
    if (!accessToken) {
      throw new Error('Missing admin access token for member invite flow')
    }

    const inviteResponse = await page.request.post(resolveBackendUrl('/invites'), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      data: {
        email: memberEmail,
        role_to_assign: 'platform:member',
        message: 'Willkommen bei Nebulynk',
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
    await invitePage.getByTestId('invite-display-name').fill(memberDisplayName)
    await invitePage.getByTestId('invite-password').fill(memberPassword)
    await invitePage.getByTestId('invite-password-confirm').fill(memberPassword)
    await invitePage.getByTestId('invite-accept-submit').click()
    await expect(invitePage.getByTestId('invite-success-go-login')).toBeVisible()
    await invitePage.close()

    let userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-logout').click()
    await expect(page).toHaveURL(/\/login$/)

    await login(page, {
      email: memberEmail,
      password: memberPassword
    })

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-open-settings').click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings-view')).toBeVisible()

    await page.getByRole('menuitem', { name: /Security|Sicherheit/ }).click()
    await page.getByTestId('settings-current-password').fill(memberPassword)
    await page.getByTestId('settings-new-password').fill(updatedMemberPassword)
    await page.getByTestId('settings-new-password-confirm').fill(updatedMemberPassword)
    await page.getByTestId('settings-save-security').click()
    await expect(page.getByTestId('settings-current-password')).toHaveValue('')

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-logout').click()
    await expect(page).toHaveURL(/\/login$/)

    await page.getByTestId('login-email').fill(memberEmail)
    await page.getByTestId('login-password').fill(memberPassword)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('login-view')).toBeVisible()

    await page.getByTestId('login-password').fill(updatedMemberPassword)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/channels/)
    await expect(page.getByTestId('app-view')).toBeVisible()
  })
})
