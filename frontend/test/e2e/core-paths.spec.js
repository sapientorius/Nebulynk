import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession, loginViaApi } from './auth-helpers.js'
import { readSharedState, writeSharedState } from './shared-state.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
let adminEmail = `admin.${runId}@example.com`
let adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'E2E Admin'
const platformName = `Nebulynk E2E ${runId}`
const inviteEmail = `member.${runId}@example.com`
const invitePassword = 'MemberPassw0rd!'
const inviteDisplayName = 'E2E Member'
const textChannelName = `text-${runId}`
const voiceChannelName = `voice-${runId}`
let defaultPublicChannelId = null
let adminAccessToken = null

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function waitForBootstrapView(page) {
  await expect.poll(async () => {
    if (await page.getByTestId('setup-view').isVisible().catch(() => false)) return 'setup'
    if (await page.getByTestId('login-view').isVisible().catch(() => false)) return 'login'
    return ''
  }, { timeout: 15_000 }).not.toBe('')

  if (await page.getByTestId('setup-view').isVisible().catch(() => false)) return 'setup'
  if (await page.getByTestId('login-view').isVisible().catch(() => false)) return 'login'

  throw new Error(`Neither setup nor login view became visible during onboarding (url=${page.url()}).`)
}

async function ensureAdminLogin(page) {
  await page.goto('/login')

  const loginVisible = await page.getByTestId('login-view')
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false)

  if (loginVisible) {
    await page.getByTestId('login-email').fill(adminEmail)
    await page.getByTestId('login-password').fill(adminPassword)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/channels/)
    await expect(page.getByTestId('app-view')).toBeVisible()
    return
  }

  await expect(page.getByTestId('setup-view')).toBeVisible()
  await page.getByTestId('setup-platform-name').fill(platformName)
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-display-name').fill(adminDisplayName)
  await page.getByTestId('setup-email').fill(adminEmail)
  await page.getByTestId('setup-password').fill(adminPassword)
  await page.getByTestId('setup-submit').click()
  await expect(page.getByTestId('setup-go-login')).toBeVisible()
  await page.getByTestId('setup-go-login').click()

  await login(page, {
    email: adminEmail,
    password: adminPassword
  })
}

function extractActiveChannelId(url) {
  const match = /\/channels\/([^/?#]+)/.exec(url)
  return match ? match[1] : null
}

function extractMeetingId(url) {
  const match = /\/meetings\/([^/?#]+)/.exec(url)
  return match ? match[1] : null
}

function activeMeetingIcon(page, channelId) {
  return page.locator(`[data-testid="sidebar-active-meeting-icon"][data-channel-id="${channelId}"]`)
}

async function expectActiveMeetingIconGreen(locator) {
  await expect(locator).toBeVisible()
  const color = await locator.evaluate((el) => window.getComputedStyle(el).color)
  expect(color).toBe('rgb(99, 226, 183)')
}

async function startOrJoinMeetingFromHeader(page) {
  const selector = [
    'button[title="Start call"]',
    'button[title="Anruf starten"]',
    'button[title="Join active call"]',
    'button[title="Aktivem Anruf beitreten"]',
    'button[title="Open active call"]',
    'button[title="Aktiven Anruf oeffnen"]'
  ].join(', ')
  const callButton = page.locator(selector).first()
  await expect(callButton).toBeVisible()
  await callButton.click()
  await expect(page).toHaveURL(/\/meetings\//)
}

async function createChannelFromSidebar(page, { name, isVoice = false, type = 'public' }) {
  await page.getByTestId('open-create-channel-modal').click()
  await expect(page.getByTestId('channel-browser-search')).toBeVisible()
  await page.getByTestId('open-channel-create-from-browser').click()
  await page.getByTestId('create-channel-name').fill(name)
  if (type === 'private') {
    await page.locator('.n-radio', { hasText: /Private|Privat/ }).first().click()
  }
  if (isVoice) {
    await page.getByTestId('create-channel-is-voice').click()
  }
  await page.getByTestId('create-channel-submit').click()
}

async function joinFirstDiscoverChannel(page, preferredChannelId = null) {
  await page.getByTestId('open-create-channel-modal').click()
  await expect(page.getByTestId('channel-browser-search')).toBeVisible()

  const actionLocator = preferredChannelId
    ? page.getByTestId(`channel-browser-action-${preferredChannelId}`)
    : page.locator('[data-testid^="channel-browser-action-"]').first()
  await expect(actionLocator).toBeVisible()

  const actionTestId = await actionLocator.getAttribute('data-testid')
  const channelId = actionTestId?.replace('channel-browser-action-', '')
  if (!channelId) {
    throw new Error(`Could not resolve discover channel id from action test id: ${actionTestId}`)
  }

  await actionLocator.click()
  const routedFromAction = await page
    .waitForURL(new RegExp(`/channels/${channelId}$`), { timeout: 2500 })
    .then(() => true)
    .catch(() => false)

  if (!routedFromAction) {
    await page.goto(`/channels/${channelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${channelId}$`))
  }

  return channelId
}

async function addMemberToChannel(page, { accessToken, channelId, userId }) {
  const response = await page.request.post(resolveBackendUrl('/channel-members'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      channel_id: channelId,
      user_id: userId
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Channel member API failed (${response.status()}): ${responseText}`)
  }
}

async function sendMessageToChannel(page, { accessToken, channelId, content }) {
  const response = await page.request.post(resolveBackendUrl('/messages'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: {
      channel_id: channelId,
      content
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Message API failed (${response.status()}): ${responseText}`)
  }

  return response.json()
}

async function createMeetingGuestInviteLink(page, { accessToken, meetingId, expiresAt = null }) {
  const payload = { action: 'create_invite_link' }
  if (expiresAt) {
    payload.expires_at = expiresAt
  }

  const response = await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    data: payload
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Meeting guest invite API failed (${response.status()}): ${responseText}`)
  }

  return response.json()
}

async function acceptMeetingInviteAsGuest(page, { joinUrl, displayName }) {
  await page.goto(joinUrl)
  await expect(page.getByTestId('meeting-invite-view')).toBeVisible()
  await page.getByTestId('meeting-invite-display-name').fill(displayName)
  await page.getByTestId('meeting-invite-submit').click()
  await expect(page).toHaveURL(/\/meetings\//)
  await expect(page.getByTestId('meeting-view')).toBeVisible()
}

async function resolveDefaultPublicChannelId(page, accessToken) {
  const response = await page.request.get(resolveBackendUrl('/channels?discover_public=true&$limit=100'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Channels discover API failed (${response.status()}): ${responseText}`)
  }

  const payload = await response.json()
  const channels = Array.isArray(payload) ? payload : payload?.data || []
  const defaultTextChannel = channels.find((channel) => !channel.is_voice && channel.purpose === 'default')
  const fallbackChannel = channels.find((channel) => !channel.is_voice) || channels[0]
  const selected = defaultTextChannel || fallbackChannel
  if (!selected?.id) {
    throw new Error('Could not resolve a discoverable public channel id from API response')
  }
  return selected.id
}

async function endMeeting(page) {
  const endButton = page.getByRole('button', { name: /End meeting|Meeting beenden/ })
  await expect(endButton).toBeVisible()
  await endButton.click()
  await expect(endButton).toHaveCount(0)
}

async function openNotificationsPanel(page) {
  await page.getByTestId('open-notifications-panel').click()
  const panel = page.getByTestId('notifications-panel-body')
  await expect(panel).toBeVisible()
  return panel
}

async function openUserMenu(page) {
  await page.getByTestId('open-user-menu').click()
  const panel = page.getByTestId('user-menu-panel')
  await expect(panel).toBeVisible()
  return panel
}

async function watchErrorMessages(page) {
  await page.evaluate(() => {
    if (!window.$message?.error) {
      window.__e2eErrorMessages = []
      return
    }
    if (window.__e2eErrorSpyInstalled) return

    window.__e2eErrorMessages = []
    const originalError = window.$message.error.bind(window.$message)
    window.$message.error = (...args) => {
      window.__e2eErrorMessages.push(args[0])
      return originalError(...args)
    }
    window.__e2eErrorSpyInstalled = true
  })
}

async function getErrorMessages(page) {
  return page.evaluate(() => window.__e2eErrorMessages || [])
}

async function getCurrentUserId(page) {
  const authResult = await getAuthFromBrowserSession(page)
  return authResult?.user?.id || null
}

async function getAccessToken(page) {
  const authResult = await getAuthFromBrowserSession(page)
  return authResult?.accessToken || null
}

async function getAuthResult(page) {
  return getAuthFromBrowserSession(page)
}

async function expectNoHorizontalOverflow(page) {
  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth > window.innerWidth + 1
  })
  expect(hasOverflow).toBe(false)
}

async function setPageForegroundState(page, { visibilityState, hasFocus }) {
  await page.evaluate(({ nextVisibilityState, nextHasFocus }) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: nextVisibilityState
    })
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => nextHasFocus
    })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event(nextHasFocus ? 'focus' : 'blur'))
  }, {
    nextVisibilityState: visibilityState,
    nextHasFocus: hasFocus
  })
}

async function injectInstallPrompt(page, outcome = 'accepted') {
  await page.evaluate((nextOutcome) => {
    const event = new Event('beforeinstallprompt')
    let promptCalls = 0
    Object.defineProperties(event, {
      prompt: {
        value: () => {
          promptCalls += 1
          window.__e2eInstallPromptCalls = promptCalls
          return Promise.resolve()
        }
      },
      userChoice: {
        value: Promise.resolve({ outcome: nextOutcome })
      }
    })
    window.dispatchEvent(event)
  }, outcome)
}

async function fetchNotifications(page, accessToken) {
  const response = await page.request.get(resolveBackendUrl('/notifications?$limit=50'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok()) {
    const responseText = await response.text()
    throw new Error(`Notifications API failed (${response.status()}): ${responseText}`)
  }

  return response.json()
}

test.describe('P2-02 core e2e paths', () => {
  test.describe.configure({ mode: 'serial' })

  test('setup and first login', async ({ page }) => {
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
      await writeSharedState({ adminEmail, adminPassword })
      await page.getByTestId('setup-go-login').click()
    } else {
      const sharedState = await readSharedState()
      if (!sharedState?.adminEmail || !sharedState?.adminPassword) {
        throw new Error(`Platform was already initialized before onboarding, but no retry credentials were available (url=${page.url()}).`)
      }

      adminEmail = sharedState.adminEmail
      adminPassword = sharedState.adminPassword
    }

    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const accessToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!accessToken) {
      throw new Error('Missing admin access token after setup login')
    }
    defaultPublicChannelId = await resolveDefaultPublicChannelId(page, accessToken)

  })

  test('platform update center shows release gaps, acknowledgement, and owner disable warning', async ({ page }) => {
    await login(page, { email: adminEmail, password: adminPassword })
    let acknowledged = false
    let checksEnabled = true
    const release = (version, security = []) => ({
      schema_version: 1,
      version,
      revision: 1,
      channel: 'stable',
      published_at: '2026-08-01T00:00:00.000Z',
      title: { de: `Release ${version}`, en: `Release ${version}` },
      summary: { de: 'Release-Zusammenfassung', en: 'Release summary' },
      changes: [{
        category: security.length ? 'security' : 'improvement',
        title: { de: 'Aenderung', en: 'Change' },
        description: { de: 'Details', en: 'Details' }
      }],
      security,
      upgrade: {
        backup_required: true,
        downtime_expected: false,
        breaking: false,
        manual_steps: { de: ['Backup erstellen'], en: ['Create a backup'] },
        docs_url: 'https://docs.example.test/update'
      },
      security_applicable: security.length > 0,
      highest_security_severity: security[0]?.severity || null,
      acknowledged
    })
    const responseBody = () => ({
      build: { version: '0.2.0', sha: 'test-sha', built_at: '2026-08-01T00:00:00.000Z' },
      checks_enabled: checksEnabled,
      can_manage_checks: true,
      check_status: checksEnabled ? 'ok' : 'disabled',
      comparison_status: 'security_update_available',
      latest_version: '0.4.0',
      update_count: 2,
      security_update_count: 1,
      highest_security_severity: 'critical',
      last_attempt_at: '2026-08-01T01:00:00.000Z',
      last_success_at: '2026-08-01T01:00:00.000Z',
      cache_stale: false,
      last_error_code: null,
      security_email_configured: true,
      security_email_status: 'available',
      releases: [
        release('0.3.0'),
        release('0.4.0', [{
          severity: 'critical',
          affected_versions: '<0.4.0',
          summary: { de: 'Kritischer Security-Fix', en: 'Critical security fix' }
        }])
      ]
    })

    await page.route(`${resolveBackendUrl('/platform-updates')}**`, async (route) => {
      const request = route.request()
      if (request.method() === 'POST' && request.url().endsWith('/acknowledgements')) acknowledged = true
      if (request.method() === 'PATCH' && request.url().endsWith('/settings')) checksEnabled = false
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(responseBody()) })
    })

    await page.goto('/admin?tab=updates')
    await expect(page.getByTestId('platform-update-center')).toBeVisible()
    await expect(page.getByText('v0.3.0')).toBeVisible()
    await expect(page.getByText('v0.4.0')).toBeVisible()
    await expect(page.getByText(/Critical security fix|Kritischer Security-Fix/)).toBeVisible()
    await expect(page.getByRole('button', { name: /install/i })).toHaveCount(0)

    await page.locator('.release-card').first().getByRole('button', { name: /Acknowledge notice|Hinweis quittieren/ }).click()
    await expect(page.locator('.release-card').first().getByText('✓')).toBeVisible()

    await page.getByTestId('platform-update-checks-enabled').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByTestId('platform-update-disable-confirmation').fill('DISABLE_UPDATE_CHECKS')
    await page.getByTestId('platform-update-disable-password').fill(adminPassword)
    await page.getByTestId('platform-update-disable-submit').click()
    await expect(page.getByText(/checks are disabled|Pruefungen sind deaktiviert/i)).toBeVisible()
  })

  test('invite accept flow', async ({ page, context }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const accessToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    expect(accessToken).toBeTruthy()
    adminAccessToken = accessToken

    const inviteResponse = await page.request.post(resolveBackendUrl('/invites'), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      data: {
        email: inviteEmail,
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
    expect(inviteUrl).toContain('/invite/')

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
  })

  test('messaging path', async ({ page }) => {
    await login(page, {
      email: inviteEmail,
      password: invitePassword
    })

    const memberAuth = await getAuthResult(page, {
      email: inviteEmail,
      password: invitePassword
    })
    const memberId = memberAuth?.user?.id || null
    if (!memberId) {
      throw new Error('Missing member id after member authentication')
    }
    if (!adminAccessToken) {
      throw new Error('Missing admin access token for channel membership setup')
    }
    await addMemberToChannel(page, {
      accessToken: adminAccessToken,
      channelId: defaultPublicChannelId,
      userId: memberId
    })

    const memberAccessToken = memberAuth.accessToken
    if (!memberAccessToken) {
      throw new Error('Missing member access token after login')
    }
    const visibleChannelsResponse = await page.request.get(resolveBackendUrl('/channels?$limit=100'), {
      headers: {
        Authorization: `Bearer ${memberAccessToken}`
      }
    })
    if (!visibleChannelsResponse.ok()) {
      const responseText = await visibleChannelsResponse.text()
      throw new Error(`Channels list API failed (${visibleChannelsResponse.status()}): ${responseText}`)
    }
    const visibleChannelsPayload = await visibleChannelsResponse.json()
    const visibleChannels = Array.isArray(visibleChannelsPayload)
      ? visibleChannelsPayload
      : visibleChannelsPayload?.data || []
    const hasDefaultChannel = visibleChannels.some((channel) => channel.id === defaultPublicChannelId)
    expect(hasDefaultChannel).toBe(true)

    await page.goto(`/channels/${defaultPublicChannelId}`)
    await expect(page).toHaveURL(/\/channels\/.+/)

    const messageText = `E2E Nachricht ${runId}`
    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeVisible()
    await input.fill(messageText)
    await input.press('Enter')

    await expect(page.locator('.message-content', { hasText: messageText })).toBeVisible()
  })

  test('mobile message reminders stay within the viewport', async ({ page }) => {
    await login(page, {
      email: inviteEmail,
      password: invitePassword
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/channels/${defaultPublicChannelId}`)

    const messageRow = page.locator('.message-item').last()
    await expect(messageRow).toBeVisible()
    await messageRow.hover()
    await messageRow.getByTestId('message-action-overflow').click()

    const overflowMenu = page.getByTestId('message-action-overflow-menu')
    await expect(overflowMenu).toBeVisible()
    await overflowMenu.getByTestId('message-action-remind').click()

    const reminderSheet = page.getByTestId('message-reminder-mobile-sheet')
    await expect(reminderSheet).toBeVisible()
    const sheetBox = await reminderSheet.boundingBox()
    expect(sheetBox).toBeTruthy()
    expect(sheetBox.x).toBeGreaterThanOrEqual(0)
    expect(sheetBox.y).toBeGreaterThanOrEqual(0)
    expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(390)
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(844)
    await expectNoHorizontalOverflow(page)

    await reminderSheet.locator('.n-date-picker').click()
    const datePanel = page.locator('.n-date-panel:visible').last()
    await expect(datePanel).toBeVisible()
    const datePanelBox = await datePanel.boundingBox()
    expect(datePanelBox).toBeTruthy()
    expect(datePanelBox.x).toBeGreaterThanOrEqual(0)
    expect(datePanelBox.y).toBeGreaterThanOrEqual(0)
    expect(datePanelBox.x + datePanelBox.width).toBeLessThanOrEqual(390)
    expect(datePanelBox.y + datePanelBox.height).toBeLessThanOrEqual(844)
    await page.keyboard.press('Escape')
    await expect(datePanel).toBeHidden()

    await reminderSheet.getByTestId('message-reminder-option-1h').click()
    await expect(reminderSheet).toBeHidden()
    await expectNoHorizontalOverflow(page)
  })

  test('top-bar user menu supports status, profile, settings, admin visibility, and logout', async ({ page }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    let userMenu = await openUserMenu(page)
    await expect(userMenu.getByTestId('user-menu-open-admin')).toBeVisible()
    await userMenu.getByTestId('user-menu-status-away').click()

    const adminUserId = (await getAuthResult(page, {
      email: adminEmail,
      password: adminPassword
    }))?.user?.id || null

    await expect.poll(async () => {
      const response = await page.request.get(resolveBackendUrl(`/users?ids[]=${encodeURIComponent(adminUserId)}`), {
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      })
      if (!response.ok()) return null
      const payload = await response.json()
      const users = Array.isArray(payload) ? payload : payload?.data || []
      return users[0]?.status || null
    }).toBe('away')

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-open-profile').click()
    const profileDrawer = page.getByTestId('user-profile-card')
    await expect(profileDrawer).toBeVisible()
    await profileDrawer.locator('.n-base-close').click()
    await expect(profileDrawer).toBeHidden()

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-open-settings').click()
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/)
    await expect(page.getByTestId('settings-view')).toBeVisible()

    const archivedChannelName = `archived-settings-${runId}`
    await page.getByRole('button', { name: /Back to Chat|Zurueck zum Chat/ }).click()
    await expect(page).toHaveURL(/\/channels/)
    await createChannelFromSidebar(page, { name: archivedChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: archivedChannelName })).toBeVisible()

    await page.getByTestId('channel-header-overflow-trigger').click()
    await page.getByTestId('channel-header-settings').click()
    await page.getByRole('button', { name: /Archive channel|Channel archivieren/ }).click()
    await expect(page.locator('.channel-name', { hasText: archivedChannelName })).toHaveCount(0)

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-open-settings').click()
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/)
    await page.getByRole('menuitem', { name: /Archived channels|Archivierte Channels/ }).click()
    const archivedChannelItem = page.getByTestId('settings-archived-channel-item').filter({ hasText: archivedChannelName })
    await expect(archivedChannelItem).toBeVisible()
    await archivedChannelItem.getByRole('button', { name: /Restore|Wiederherstellen/ }).click()
    await expect(archivedChannelItem).toHaveCount(0)

    userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-logout').click()
    await expect(page).toHaveURL(/\/login$/)

    await login(page, {
      email: inviteEmail,
      password: invitePassword
    })

    userMenu = await openUserMenu(page)
    await expect(userMenu.getByTestId('user-menu-open-admin')).toHaveCount(0)
    await userMenu.getByTestId('user-menu-open-settings').click()
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/)
    await expect(page.getByRole('menuitem', { name: /Archived channels|Archivierte Channels/ })).toHaveCount(0)
  })

  test('mobile layout uses drawer navigation across app, settings, and administration', async ({ page }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const mobileChannelName = `mobile-nav-${runId}`
    await createChannelFromSidebar(page, { name: mobileChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: mobileChannelName })).toBeVisible()
    const mobileChannelId = extractActiveChannelId(page.url())
    if (!mobileChannelId) {
      throw new Error(`Could not resolve mobile test channel id from URL: ${page.url()}`)
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/channels/${defaultPublicChannelId}`)
    await expect(page.getByTestId('app-mobile-nav-trigger')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByTestId('app-mobile-nav-trigger').click()
    const appDrawer = page.getByTestId('app-mobile-sidebar-drawer')
    await expect(appDrawer).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/channels/${defaultPublicChannelId}\\?mobileNav=sidebar$`))

    await appDrawer.getByRole('menuitem', { name: new RegExp(mobileChannelName, 'i') }).click()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}$`))
    await expect(appDrawer).toBeHidden()

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}\\?mobileNav=sidebar$`))
    await expect(appDrawer).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/channels/${defaultPublicChannelId}$`))
    await expect(appDrawer).toBeHidden()

    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}\\?mobileNav=sidebar$`))
    await expect(appDrawer).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}$`))
    await expect(appDrawer).toBeHidden()
    await expectNoHorizontalOverflow(page)

    await page.getByTestId('app-mobile-nav-trigger').click()
    await expect(appDrawer).toBeVisible()
    await appDrawer.getByRole('menuitem', { name: new RegExp(mobileChannelName, 'i') }).click()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}$`))
    await expect(appDrawer).toBeHidden()

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}\\?mobileNav=sidebar$`))
    await expect(appDrawer).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/channels/${mobileChannelId}$`))
    await expect(appDrawer).toBeHidden()

    let userMenu = await openUserMenu(page)
    await userMenu.getByTestId('user-menu-open-settings').click()
    await expect(page).toHaveURL(/\/settings(?:\?.*)?$/)
    await expect(page.getByTestId('settings-mobile-menu-trigger')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByTestId('settings-mobile-menu-trigger').click()
    const settingsDrawer = page.getByTestId('settings-mobile-menu-drawer')
    await expect(settingsDrawer).toBeVisible()
    await settingsDrawer.getByRole('menuitem', { name: /Voice settings|Voice-Einstellungen/ }).click()
    await expect(settingsDrawer).toBeHidden()
    await expect(page.getByTestId('settings-mobile-section-label')).toContainText(/Voice settings|Voice-Einstellungen/)
    await expectNoHorizontalOverflow(page)

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByTestId('admin-mobile-menu-trigger')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByTestId('admin-mobile-menu-trigger').click()
    const adminDrawer = page.getByTestId('admin-mobile-menu-drawer')
    await expect(adminDrawer).toBeVisible()
    await adminDrawer.getByRole('menuitem', { name: /Roles|Rollen/ }).click()
    await expect(adminDrawer).toBeHidden()
    await expect(page.getByTestId('admin-mobile-section-label')).toContainText(/Roles|Rollen/)
    await expectNoHorizontalOverflow(page)

    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('settings exposes the PWA install surface and shared worker registration', async ({ page }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    await page.goto('/settings')
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('link[rel="manifest"][href="/manifest.webmanifest"]')).toHaveCount(1)

    await expect.poll(async () => {
      return page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return false
        const registration = await navigator.serviceWorker.getRegistration()
        return Boolean(registration)
      })
    }).toBe(true)

    await injectInstallPrompt(page)
    const installCard = page.getByTestId('settings-install-app-card')
    await expect(installCard).toBeVisible()
    await installCard.getByTestId('settings-install-app').click()

    await expect.poll(async () => page.evaluate(() => window.__e2eInstallPromptCalls || 0)).toBe(1)
  })

  test('forwarding a file message duplicates the attachment into the target channel', async ({ page }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const sourceChannelName = `forward-src-${runId}`
    const targetChannelName = `forward-target-${runId}`
    const forwardedFileName = `forward-${runId}.txt`

    await createChannelFromSidebar(page, { name: sourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: sourceChannelName })).toBeVisible()
    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    await createChannelFromSidebar(page, { name: targetChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: targetChannelName })).toBeVisible()
    const targetChannelId = extractActiveChannelId(page.url())
    if (!targetChannelId) {
      throw new Error(`Could not resolve target channel id from URL: ${page.url()}`)
    }

    await page.getByRole('menuitem', { name: sourceChannelName }).click()
    await expect(page).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

    const input = page.getByTestId('message-input-textarea')
    await expect(input).toBeEditable()

    const fileInput = page.locator('.file-upload input[type="file"]')
    await expect(fileInput).toBeAttached()
    const uploadResponsePromise = page.waitForResponse((response) => (
      response.url() === resolveBackendUrl('/upload')
      && response.request().method() === 'POST'
    ), { timeout: 30_000 })

    await fileInput.setInputFiles([{
      name: forwardedFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`Forward attachment ${runId}`)
    }])

    const uploadResponse = await uploadResponsePromise
    if (!uploadResponse.ok()) {
      const responseText = await uploadResponse.text()
      throw new Error(`File upload failed (${uploadResponse.status()}): ${responseText}`)
    }
    await expect(page.locator('.pending-file-name', { hasText: forwardedFileName })).toBeVisible({ timeout: 30_000 })

    await input.fill(`Forward file ${runId}`)
    await input.press('Enter')

    const sourceMessage = page.locator('[data-message-id]').filter({ hasText: forwardedFileName }).last()
    await expect(sourceMessage).toBeVisible()
    await sourceMessage.hover()
    await sourceMessage.getByTestId('message-action-overflow').click()
    await page.getByTestId('message-action-overflow-menu')
      .getByRole('button', { name: /Forward|Weiterleiten/ })
      .click()

    const forwardModal = page.getByTestId('forward-message-modal')
    await expect(forwardModal).toBeVisible()
    await expect(forwardModal.getByTestId('forward-source-files')).toContainText(forwardedFileName)

    await forwardModal.locator('.n-base-selection').click()
    await page.locator('.n-base-select-option', { hasText: `# ${targetChannelName}` }).click()
    await forwardModal.getByRole('button', { name: /Forward|Weiterleiten/ }).click()

    await page.getByRole('menuitem', { name: targetChannelName }).click()
    await expect(page).toHaveURL(new RegExp(`/channels/${targetChannelId}$`))

    const forwardedMessage = page.locator('[data-message-id]').filter({ hasText: forwardedFileName }).last()
    await expect(forwardedMessage).toBeVisible()
    await expect(forwardedMessage).toContainText(/Forwarded message|Weitergeleitete Nachricht/)
  })

  test('public channel discover, join and leave flow', async ({ page }) => {
    await login(page, {
      email: inviteEmail,
      password: invitePassword
    })

    const joinedChannelId = await joinFirstDiscoverChannel(page, defaultPublicChannelId)

    const typeIcon = page.locator(
      `[data-testid="sidebar-channel-type-icon"][data-channel-id="${joinedChannelId}"]`
    )
    await expect(typeIcon).toBeVisible()

    await page.getByTestId('channel-header-overflow-trigger').click()
    await page.getByTestId('leave-current-channel').click()
    await page.getByTestId('confirm-leave-channel').click()
    await expect(page).not.toHaveURL(new RegExp(`/channels/${joinedChannelId}$`))
    await expect(typeIcon).toHaveCount(0)
  })

  test('starting call and accepting incoming overlay do not emit false call errors', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const overlaySourceChannelName = `overlay-src-${runId}`
    await createChannelFromSidebar(page, { name: overlaySourceChannelName })
    await expect(page.locator('.channel-name', { hasText: overlaySourceChannelName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()

    try {
      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      await memberPage.goto(`/channels/${sourceChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      await watchErrorMessages(page)
      await startOrJoinMeetingFromHeader(page)
      const meetingId = extractMeetingId(page.url())
      if (!meetingId) {
        throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
      }

      const startErrors = await getErrorMessages(page)
      const falseStartErrors = startErrors.filter((entry) => /could not start call|anruf konnte nicht gestartet werden/i.test(String(entry)))
      expect(falseStartErrors).toEqual([])

      const adminAccessToken = await getAccessToken(page, {
        email: adminEmail,
        password: adminPassword
      })
      if (!adminAccessToken) {
        throw new Error('Missing admin access token for meeting invite API call')
      }

      const memberId = await getCurrentUserId(memberPage)
      if (!memberId) {
        throw new Error('Missing member id after member authentication')
      }

      await addMemberToChannel(page, {
        accessToken: adminAccessToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      const inviteResponse = await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        },
        data: {
          action: 'invite',
          user_ids: [memberId]
        }
      })
      if (!inviteResponse.ok()) {
        const responseText = await inviteResponse.text()
        throw new Error(`Meeting invite API failed (${inviteResponse.status()}): ${responseText}`)
      }

      await watchErrorMessages(memberPage)
      const overlay = memberPage.getByTestId('incoming-call-overlay')
      await expect(overlay).toBeVisible()
      await overlay.getByRole('button', { name: /Accept|Annehmen/ }).click()
      await expect(memberPage).toHaveURL(new RegExp(`/meetings/${meetingId}$`))

      const overlayErrors = await getErrorMessages(memberPage)
      const falseJoinErrors = overlayErrors.filter((entry) => /could not join call|anruf konnte nicht beigetreten werden/i.test(String(entry)))
      expect(falseJoinErrors).toEqual([])

      await page.goto(`/meetings/${meetingId}`)
      await endMeeting(page)
    } finally {
      await memberContext.close()
    }
  })

  test('joining active source-channel call does not emit false start error', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const joinSourceChannelName = `join-src-${runId}`
    await createChannelFromSidebar(page, { name: joinSourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: joinSourceChannelName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }
    await expect(page.locator(
      `[data-testid="sidebar-channel-type-icon"][data-channel-id="${sourceChannelId}"]`
    )).toBeVisible()

    await startOrJoinMeetingFromHeader(page)
    const meetingId = extractMeetingId(page.url())
    if (!meetingId) {
      throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()
    try {
      const adminAccessToken = await getAccessToken(page, {
        email: adminEmail,
        password: adminPassword
      })
      if (!adminAccessToken) {
        throw new Error('Missing admin access token for channel member API call')
      }

      const memberAuth = await loginViaApi(page.request, {
        email: inviteEmail,
        password: invitePassword
      })
      const memberId = memberAuth?.user?.id
      if (!memberId) {
        throw new Error('Missing member id after member authentication')
      }

      await addMemberToChannel(page, {
        accessToken: adminAccessToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      const sourceChannelMenuItem = memberPage.getByRole('menuitem', { name: joinSourceChannelName })
      await expect(sourceChannelMenuItem).toBeVisible()
      await sourceChannelMenuItem.click()
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      await watchErrorMessages(memberPage)
      await startOrJoinMeetingFromHeader(memberPage)
      await expect(memberPage).toHaveURL(/\/meetings\//)
      const joinedMeetingId = extractMeetingId(memberPage.url())
      if (!joinedMeetingId) {
        throw new Error(`Could not resolve joined meeting id from URL: ${memberPage.url()}`)
      }

      const errors = await getErrorMessages(memberPage)
      const falseStartErrors = errors.filter((entry) => /could not start call|anruf konnte nicht gestartet werden/i.test(String(entry)))
      expect(falseStartErrors).toEqual([])

      const meetingIdsToEnd = [...new Set([meetingId, joinedMeetingId])]
      for (const idToEnd of meetingIdsToEnd) {
        await page.goto(`/meetings/${idToEnd}`)
        const endButton = page.getByRole('button', { name: /End meeting|Meeting beenden/ })
        if (await endButton.count() > 0) {
          await endButton.click()
          await expect(endButton).toHaveCount(0)
        }
      }
    } finally {
      await memberContext.close()
    }
  })

  test('meeting invite notification panel shows a single meeting card with open and join actions', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const notificationSourceChannelName = `notif-src-${runId}`
    await createChannelFromSidebar(page, { name: notificationSourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: notificationSourceChannelName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    const adminAccessToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!adminAccessToken) {
      throw new Error('Missing admin access token for notification invite flow')
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()

    try {
      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })

      const memberId = await getCurrentUserId(memberPage)
      if (!memberId) {
        throw new Error('Missing member id from localStorage user payload')
      }

      await addMemberToChannel(page, {
        accessToken: adminAccessToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      await memberPage.goto(`/channels/${sourceChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      await startOrJoinMeetingFromHeader(page)
      const meetingId = extractMeetingId(page.url())
      if (!meetingId) {
        throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
      }

      const inviteResponse = await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        },
        data: {
          action: 'invite',
          user_ids: [memberId]
        }
      })
      if (!inviteResponse.ok()) {
        const responseText = await inviteResponse.text()
        throw new Error(`Meeting invite API failed (${inviteResponse.status()}): ${responseText}`)
      }

      const memberToken = await getAccessToken(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      if (!memberToken) {
        throw new Error('Missing member access token for notification invite flow')
      }

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        return notifications.filter((entry) => entry.type === 'meeting_invite' && entry.meeting_id === meetingId).length
      }).toBe(1)

      const incomingOverlay = memberPage.getByTestId('incoming-call-overlay')
      const overlayDeclineButton = incomingOverlay.getByRole('button', { name: /Decline|Ablehnen/ })
      const overlayVisible = await overlayDeclineButton
        .waitFor({ state: 'visible', timeout: 2000 })
        .then(() => true)
        .catch(() => false)

      if (overlayVisible) {
        await overlayDeclineButton.click()
      }

      let notificationsPanel = await openNotificationsPanel(memberPage)
      let notificationMeetingCards = notificationsPanel.locator(
        `[data-testid="notification-meeting-card"] [data-testid="meeting-card"][data-meeting-id="${meetingId}"]`
      )
      await expect(notificationMeetingCards).toHaveCount(1)
      let notificationMeetingCard = notificationMeetingCards.first()

      await expect(notificationMeetingCard).toBeVisible()
      await expect(notificationMeetingCard.getByTestId('meeting-card-status')).toContainText(/Active|Aktiv/)
      await expect(notificationsPanel.locator('.notif-snippet', {
        hasText: `[Meeting] /meetings/${meetingId}`
      })).toHaveCount(0)
      await expect(notificationsPanel.locator('.notif-snippet', {
        hasText: `Meeting invite: /meetings/${meetingId}`
      })).toHaveCount(0)

      await notificationMeetingCard.getByTestId('meeting-card-open').click()
      await expect(memberPage).toHaveURL(new RegExp(`/meetings/${meetingId}$`))
      await expect(memberPage.getByTestId('meeting-view')).toBeVisible()

      notificationsPanel = await openNotificationsPanel(memberPage)
      notificationMeetingCards = notificationsPanel.locator(
        `[data-testid="notification-meeting-card"] [data-testid="meeting-card"][data-meeting-id="${meetingId}"]`
      )
      await expect(notificationMeetingCards).toHaveCount(1)
      notificationMeetingCard = notificationMeetingCards.first()
      await notificationMeetingCard.getByTestId('meeting-card-join').click()
      await expect(memberPage).toHaveURL(new RegExp(`/meetings/${meetingId}$`))
      await expect(memberPage.getByTestId('voice-controls')).toBeVisible()

      notificationsPanel = await openNotificationsPanel(memberPage)
      notificationMeetingCards = notificationsPanel.locator(
        `[data-testid="notification-meeting-card"] [data-testid="meeting-card"][data-meeting-id="${meetingId}"]`
      )
      await expect(notificationMeetingCards).toHaveCount(1)
      notificationMeetingCard = notificationMeetingCards.first()
      await expect(notificationMeetingCard.getByTestId('meeting-card-join')).toBeDisabled()

      await page.goto(`/meetings/${meetingId}`)
      await endMeeting(page)
    } finally {
      await memberContext.close()
    }
  })

  test('guest meeting participants get a floating voice dock for leave and audio settings control', async ({ page, browser }) => {
    await ensureAdminLogin(page)

    const guestDockSourceChannelName = `guest-dock-src-${runId}`
    await createChannelFromSidebar(page, { name: guestDockSourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: guestDockSourceChannelName })).toBeVisible()

    await startOrJoinMeetingFromHeader(page)
    const meetingId = extractMeetingId(page.url())
    if (!meetingId) {
      throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
    }

    const accessToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!accessToken) {
      throw new Error('Missing admin access token for guest voice dock flow')
    }

    const invitePayload = await createMeetingGuestInviteLink(page, {
      accessToken,
      meetingId
    })
    const joinUrl = invitePayload?.guest_invite_link?.join_url
    if (!joinUrl) {
      throw new Error('Missing guest join URL from meeting invite payload')
    }

    const guestContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const guestPage = await guestContext.newPage()

    try {
      await acceptMeetingInviteAsGuest(guestPage, {
        joinUrl,
        displayName: `Guest Dock ${runId}`
      })

      const guestDock = guestPage.locator('[data-testid="voice-controls"][data-variant="floating"]')
      await expect(guestDock).toHaveCount(0)
      await expect(
        guestPage.getByTestId('meeting-view').getByRole('button', { name: /Join call|Anruf beitreten/ })
      ).toBeVisible()

      await guestPage.getByRole('button', { name: /Join call|Anruf beitreten/ }).click()
      await expect(guestDock).toBeVisible()
      await expect(guestPage.getByTestId('voice-status-connected')).toBeVisible()
      await expect(guestPage.getByTestId('voice-drag-handle')).toBeVisible()
      await expect(guestPage.getByTestId('voice-open-settings')).toBeVisible()

      const dockBefore = await guestDock.boundingBox()
      const dragHandle = guestPage.getByTestId('voice-drag-handle')
      const handleBefore = await dragHandle.boundingBox()
      if (!dockBefore || !handleBefore) {
        throw new Error('Missing dock bounding box for drag verification')
      }

      await guestPage.mouse.move(handleBefore.x + (handleBefore.width / 2), handleBefore.y + (handleBefore.height / 2))
      await guestPage.mouse.down()
      await guestPage.mouse.move(
        Math.max(32, handleBefore.x - 120),
        Math.max(32, handleBefore.y - 80),
        { steps: 10 }
      )
      await guestPage.mouse.up()

      const dockAfterDrag = await guestDock.boundingBox()
      if (!dockAfterDrag) {
        throw new Error('Missing dock bounding box after drag verification')
      }
      expect(
        Math.abs(dockAfterDrag.x - dockBefore.x) > 20
        || Math.abs(dockAfterDrag.y - dockBefore.y) > 20
      ).toBe(true)

      await guestPage.getByTestId('voice-open-settings').click()
      await guestPage.getByTestId('voice-open-settings-audio').click()
      await expect(guestPage.getByTestId('voice-settings-content')).toBeVisible()
      await guestPage.keyboard.press('Escape')
      await expect(guestPage.getByTestId('voice-settings-content')).toBeHidden()

      await guestPage.getByTestId('voice-open-settings').click()
      await guestPage.getByTestId('voice-open-settings-video').click()
      await expect(guestPage.getByTestId('video-settings-content')).toBeVisible()
      await guestPage.keyboard.press('Escape')
      await expect(guestPage.getByTestId('video-settings-content')).toBeHidden()

      await guestPage.getByTestId('voice-leave').first().click()
      await expect(guestDock).toHaveCount(0)
      await expect(
        guestPage.getByTestId('meeting-view').getByRole('button', { name: /Join call|Anruf beitreten/ })
      ).toBeVisible()

      await guestPage.getByRole('button', { name: /Join call|Anruf beitreten/ }).click()
      await expect(guestDock).toBeVisible()
    } finally {
      await guestContext.close()
    }

    await page.goto(`/meetings/${meetingId}`)
    await endMeeting(page)
  })

  test('mention notification becomes read only after the source message is visible in channel', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const autoReadSourceChannelName = `notif-autoread-src-${runId}`
    await createChannelFromSidebar(page, { name: autoReadSourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: autoReadSourceChannelName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    const adminToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!adminToken) {
      throw new Error('Missing admin access token for notification auto-read flow')
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()

    try {
      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })

      const memberId = await getCurrentUserId(memberPage)
      if (!memberId) {
        throw new Error('Missing member id from localStorage user payload')
      }

      await addMemberToChannel(page, {
        accessToken: adminToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      const memberToken = await getAccessToken(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      if (!memberToken) {
        throw new Error('Missing member access token for notification auto-read flow')
      }

      await memberPage.goto(`/channels/${defaultPublicChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${defaultPublicChannelId}$`))

      const mentionMessageText = `Auto-read mention ${runId} @${inviteDisplayName}`
      await sendMessageToChannel(page, {
        accessToken: adminToken,
        channelId: sourceChannelId,
        content: mentionMessageText
      })

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.message_snippet === mentionMessageText)
        return notification?.is_read ?? null
      }).toBe(false)

      // The default timeline page contains 50 messages, so the mention belongs to the older page.
      for (let index = 0; index < 51; index++) {
        await sendMessageToChannel(page, {
          accessToken: adminToken,
          channelId: sourceChannelId,
          content: `Auto-read filler ${runId}-${index}`
        })
      }

      await memberPage.bringToFront()
      await memberPage.goto(`/channels/${sourceChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      const messageList = memberPage.getByTestId('message-list')
      await expect(messageList).toBeVisible()
      const loadOlderButton = memberPage.getByRole('button', { name: /Load older messages|Aeltere Nachrichten laden/ })
      await expect(loadOlderButton).toBeVisible()
      await loadOlderButton.click()

      const mentionedRow = memberPage.locator('[data-message-id]').filter({ hasText: mentionMessageText }).first()
      await mentionedRow.scrollIntoViewIfNeeded()
      await expect(mentionedRow).toBeInViewport()

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.message_snippet === mentionMessageText)
        return notification?.is_read ?? null
      }).toBe(true)
    } finally {
      await memberContext.close()
    }
  })

  test('returning to the foreground marks a visible source message notification as read', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const autoReadSourceChannelName = `notif-foreground-src-${runId}`
    await createChannelFromSidebar(page, { name: autoReadSourceChannelName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: autoReadSourceChannelName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    const adminToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!adminToken) {
      throw new Error('Missing admin access token for foreground notification auto-read flow')
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()

    try {
      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })

      const memberId = await getCurrentUserId(memberPage)
      if (!memberId) {
        throw new Error('Missing member id from localStorage user payload')
      }

      await addMemberToChannel(page, {
        accessToken: adminToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      const memberToken = await getAccessToken(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      if (!memberToken) {
        throw new Error('Missing member access token for foreground notification auto-read flow')
      }

      await memberPage.goto(`/channels/${sourceChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))
      await expect(memberPage.getByTestId('message-list')).toBeVisible()

      await setPageForegroundState(memberPage, {
        visibilityState: 'hidden',
        hasFocus: false
      })
      await expect.poll(async () => memberPage.evaluate(() => document.visibilityState)).toBe('hidden')

      const mentionMessageText = `Foreground auto-read mention ${runId} @${inviteDisplayName}`
      await page.goto(`/channels/${sourceChannelId}`)
      await expect(page).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      const adminInput = page.getByTestId('message-input-textarea')
      await adminInput.fill(mentionMessageText)
      await adminInput.press('Enter')

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.message_snippet === mentionMessageText)
        return notification?.is_read ?? null
      }).toBe(false)

      await setPageForegroundState(memberPage, {
        visibilityState: 'visible',
        hasFocus: true
      })
      await expect.poll(async () => memberPage.evaluate(() => document.visibilityState)).toBe('visible')

      const mentionedRow = memberPage.locator('[data-message-id]').filter({ hasText: mentionMessageText }).first()
      await expect(mentionedRow).toBeVisible()

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.message_snippet === mentionMessageText)
        return notification?.is_read ?? null
      }).toBe(true)
    } finally {
      await memberContext.close()
    }
  })

  test('opening a meeting view marks its invite notification as read without using the notifications panel', async ({ page, browser }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    const autoReadMeetingSourceName = `meeting-autoread-src-${runId}`
    await createChannelFromSidebar(page, { name: autoReadMeetingSourceName, type: 'private' })
    await expect(page.locator('.channel-name', { hasText: autoReadMeetingSourceName })).toBeVisible()

    const sourceChannelId = extractActiveChannelId(page.url())
    if (!sourceChannelId) {
      throw new Error(`Could not resolve source channel id from URL: ${page.url()}`)
    }

    const adminToken = await getAccessToken(page, {
      email: adminEmail,
      password: adminPassword
    })
    if (!adminToken) {
      throw new Error('Missing admin access token for meeting invite auto-read flow')
    }

    const memberContext = await browser.newContext({
      baseURL: new URL(page.url()).origin
    })
    const memberPage = await memberContext.newPage()

    try {
      await login(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })

      const memberId = await getCurrentUserId(memberPage)
      if (!memberId) {
        throw new Error('Missing member id from localStorage user payload')
      }

      await addMemberToChannel(page, {
        accessToken: adminToken,
        channelId: sourceChannelId,
        userId: memberId
      })

      const memberToken = await getAccessToken(memberPage, {
        email: inviteEmail,
        password: invitePassword
      })
      if (!memberToken) {
        throw new Error('Missing member access token for meeting invite auto-read flow')
      }

      await memberPage.goto(`/channels/${sourceChannelId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/channels/${sourceChannelId}$`))

      await startOrJoinMeetingFromHeader(page)
      const meetingId = extractMeetingId(page.url())
      if (!meetingId) {
        throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
      }

      const inviteResponse = await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
        headers: {
          Authorization: `Bearer ${adminToken}`
        },
        data: {
          action: 'invite',
          user_ids: [memberId]
        }
      })
      if (!inviteResponse.ok()) {
        const responseText = await inviteResponse.text()
        throw new Error(`Meeting invite API failed (${inviteResponse.status()}): ${responseText}`)
      }

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.type === 'meeting_invite' && entry.meeting_id === meetingId)
        return notification?.is_read ?? null
      }).toBe(false)

      const incomingOverlay = memberPage.getByTestId('incoming-call-overlay')
      const overlayDeclineButton = incomingOverlay.getByRole('button', { name: /Decline|Ablehnen/ })
      const overlayVisible = await overlayDeclineButton
        .waitFor({ state: 'visible', timeout: 2000 })
        .then(() => true)
        .catch(() => false)

      if (overlayVisible) {
        await overlayDeclineButton.click()
      }

      await memberPage.goto(`/meetings/${meetingId}`)
      await expect(memberPage).toHaveURL(new RegExp(`/meetings/${meetingId}$`))
      await expect(memberPage.getByTestId('meeting-view')).toBeVisible()

      await expect.poll(async () => {
        const payload = await fetchNotifications(memberPage, memberToken)
        const notifications = Array.isArray(payload?.data) ? payload.data : payload?.data?.data || []
        const notification = notifications.find((entry) => entry.type === 'meeting_invite' && entry.meeting_id === meetingId)
        return notification?.is_read ?? null
      }).toBe(true)

      await page.goto(`/meetings/${meetingId}`)
      await endMeeting(page)
    } finally {
      await memberContext.close()
    }
  })

  test('voice join, leave, and sidebar meeting indicators', async ({ page }) => {
    await login(page, {
      email: adminEmail,
      password: adminPassword
    })

    await createChannelFromSidebar(page, { name: textChannelName })
    await expect(page.locator('.channel-name', { hasText: textChannelName })).toBeVisible()

    const textChannelId = extractActiveChannelId(page.url())
    if (!textChannelId) {
      throw new Error(`Could not resolve active channel id from URL: ${page.url()}`)
    }
    const textChannelMeetingIcon = activeMeetingIcon(page, textChannelId)
    await expect(textChannelMeetingIcon).toHaveCount(0)

    await startOrJoinMeetingFromHeader(page)
    const textMeetingId = extractMeetingId(page.url())
    if (!textMeetingId) {
      throw new Error(`Could not resolve meeting id from URL: ${page.url()}`)
    }
    await expectActiveMeetingIconGreen(textChannelMeetingIcon)

    await page.goto(`/channels/${textChannelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${textChannelId}$`))
    const textMeetingCard = page.locator(
      `[data-testid="meeting-card"][data-meeting-id="${textMeetingId}"]`
    )
    await expect(textMeetingCard).toBeVisible()
    await expect(textMeetingCard.getByTestId('meeting-card-status')).toContainText(/Active|Aktiv/)

    await textMeetingCard.getByTestId('meeting-card-open').click()
    await expect(page).toHaveURL(new RegExp(`/meetings/${textMeetingId}$`))

    await page.goto(`/channels/${textChannelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${textChannelId}$`))
    await expect(textMeetingCard.getByTestId('meeting-card-join')).toBeDisabled()

    await page.getByTestId('voice-leave').first().click()
    await expect(page.getByTestId('voice-controls')).toBeHidden()
    await expect(textMeetingCard.getByTestId('meeting-card-join')).toBeEnabled()

    await textMeetingCard.getByTestId('meeting-card-open').click()
    await expect(page).toHaveURL(new RegExp(`/meetings/${textMeetingId}$`))
    await expect(
      page.getByTestId('meeting-view').getByRole('button', { name: /Join call|Anruf beitreten/ })
    ).toBeVisible()

    await page.locator('.channel-sidebar .n-menu').getByText(textChannelName).click()
    await expect(page).toHaveURL(new RegExp(`/channels/${textChannelId}$`))
    await expect(page.getByTestId('meeting-view')).toHaveCount(0)
    await expect(page.getByTestId('app-view')).toBeVisible()
    await expect(page.locator('.channel-name', { hasText: textChannelName })).toBeVisible()
    await expect(page.locator('.artifacts-panel')).toHaveCount(0)

    await page.goto(`/channels/${textChannelId}`)
    await textMeetingCard.getByTestId('meeting-card-join').click()
    await expect(page).toHaveURL(new RegExp(`/meetings/${textMeetingId}$`))
    await expect(page.getByRole('button', { name: /End meeting|Meeting beenden/ })).toBeVisible()

    await endMeeting(page)
    await expect(textChannelMeetingIcon).toHaveCount(0)

    await page.goto(`/channels/${textChannelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${textChannelId}$`))
    await expect(textMeetingCard).toBeVisible()
    await expect(textMeetingCard.getByTestId('meeting-card-status')).toContainText(/Ended|Beendet/)
    await expect(textMeetingCard.getByTestId('meeting-card-join')).toHaveCount(0)

    await textMeetingCard.getByTestId('meeting-card-open').click()
    await expect(page).toHaveURL(new RegExp(`/meetings/${textMeetingId}$`))

    await page.goto(`/channels/${textChannelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${textChannelId}$`))

    await createChannelFromSidebar(page, { name: voiceChannelName, isVoice: true })

    const voiceRow = page.locator('.voice-channel-item', { hasText: voiceChannelName }).first()
    await expect(voiceRow).toBeVisible()
    const voiceChannelId = await voiceRow.getByTestId('voice-channel-open-chat').getAttribute('data-channel-id')
    if (!voiceChannelId) {
      throw new Error('Missing voice channel id on open-chat button')
    }
    const voiceChannelMeetingIcon = activeMeetingIcon(page, voiceChannelId)
    await expect(voiceChannelMeetingIcon).toHaveCount(0)

    await voiceRow.getByTestId('voice-channel-open-chat').click()
    await expect(page.locator('.channel-name', { hasText: voiceChannelName })).toBeVisible()
    await expect(page.getByTestId('voice-controls')).toBeHidden()
    await expect(voiceRow).toHaveClass(/active/)

    await startOrJoinMeetingFromHeader(page)
    await expectActiveMeetingIconGreen(voiceChannelMeetingIcon)
    await endMeeting(page)
    await expect(voiceChannelMeetingIcon).toHaveCount(0)

    await page.goto(`/channels/${voiceChannelId}`)
    await expect(page).toHaveURL(new RegExp(`/channels/${voiceChannelId}$`))
    await expect(page.getByTestId('voice-controls')).toBeHidden()

    const selfUserId = await getCurrentUserId(page)
    if (!selfUserId) {
      throw new Error('Could not resolve current user id from localStorage payload')
    }
    await page.getByRole('button', { name: /\b(Members|Mitglieder)\b/ }).click()
    await expect(page.locator('.member-panel')).toBeVisible()

    const memberVoiceConnected = page.locator(
      `[data-testid="member-voice-connected-indicator"][data-user-id="${selfUserId}"]`
    )
    await expect(memberVoiceConnected).toHaveCount(0)

    await voiceRow.locator('.voice-channel-name', { hasText: voiceChannelName }).click()
    await expect(page.getByTestId('voice-status-connected')).toBeVisible()
    await expect(memberVoiceConnected).toBeVisible()

    await page.getByTestId('voice-leave').first().click()
    await expect(page.getByTestId('voice-controls')).toBeHidden()
    await expect(memberVoiceConnected).toHaveCount(0)
  })

  test('meetings overview keeps past summary overlays interactive and loads more past meetings on demand', async ({ page }) => {
    await ensureAdminLogin(page)

    function createPastMeeting(index) {
      const paddedIndex = String(index).padStart(2, '0')
      return {
        id: `meeting-past-${index}`,
        detail_level: 'full',
        status: 'ended',
        title: `Past Meeting ${index}`,
        source_channel_id: `source-past-${index}`,
        source_channel: {
          id: `source-past-${index}`,
          name: 'archive',
          type: 'private',
          display_name: 'Archive'
        },
        chat_channel_id: `meeting-past-channel-${index}`,
        chat_channel: {
          id: `meeting-past-channel-${index}`,
          name: `meeting-past-${index}`,
          purpose: 'meeting',
          is_voice: true,
          is_archived: true
        },
        started_at: `2026-04-${paddedIndex}T09:00:00.000Z`,
        ended_at: `2026-04-${paddedIndex}T10:00:00.000Z`,
        engaged_participant_count: 3,
        participants: [],
        artifacts: [{
          artifact_type: 'summary',
          status: 'ready',
          payload: {
            mini_summary: `Past summary ${index} with more detail for the overview overlay.`
          }
        }],
        summary_generation: {
          available: false,
          allowed: false,
          action: null,
          reason: 'ready'
        }
      }
    }

    await page.route('**/*meetings*', async (route) => {
      const request = route.request()
      if (request.method() !== 'GET') {
        await route.continue()
        return
      }

      const url = new URL(request.url())
      if (/\/meetings\/meeting-past-\d+$/.test(url.pathname)) {
        const index = Number(url.pathname.match(/meeting-past-(\d+)$/)?.[1] || 1)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: createPastMeeting(index) })
        })
        return
      }

      if (!/\/meetings$/.test(url.pathname)) {
        await route.continue()
        return
      }

      const timeBucket = url.searchParams.get('time_bucket')
      if (timeBucket === 'upcoming' || timeBucket === 'live') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [] })
        })
        return
      }

      if (timeBucket === 'past') {
        const limit = Number(url.searchParams.get('$limit') || '0')
        const count = Math.min(Math.max(limit, 0), 17)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: Array.from({ length: count }, (_, index) => createPastMeeting(index + 1))
          })
        })
        return
      }

      await route.continue()
    })

    await page.route('**/*meeting-questions*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] })
      })
    })

    await page.goto('/meetings')
    await expect(page.getByTestId('meetings-overview-view')).toBeVisible()

    const pastMeetingCards = page.locator('[data-testid="meeting-card"][data-meeting-id^="meeting-past-"]')
    const loadMoreButton = page.getByTestId('meetings-overview-past-load-more')
    await expect(pastMeetingCards).toHaveCount(8)
    await expect(loadMoreButton).toBeVisible()

    const firstPastCard = page.locator('[data-testid="meeting-card"][data-meeting-id="meeting-past-1"]').first()
    const firstPastSummary = firstPastCard.getByTestId('meeting-card-mini-summary')
    await firstPastSummary.click()
    await expect(page).toHaveURL(/\/meetings$/)
    await expect(page.locator('.meeting-card-mini-summary-popover')).toContainText(
      'Past summary 1 with more detail for the overview overlay.'
    )

    await firstPastCard.getByTestId('meeting-card-status').click()
    await expect(page).toHaveURL(/\/meetings\/meeting-past-1$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/meetings$/)
    await expect(page.getByTestId('meetings-overview-view')).toBeVisible()

    await page.getByTestId('meetings-overview-past-load-more').click()
    await expect(pastMeetingCards).toHaveCount(16)
  })
})
