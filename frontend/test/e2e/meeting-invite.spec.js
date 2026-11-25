import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession, loginViaApi, openLoginForm } from './auth-helpers.js'
import { readSharedState } from './shared-state.js'
import { resolveBackendUrl } from './test-urls.js'

test('a guest link in a new tab opens the meeting after a member is invited', async ({ page, request }) => {
  const credentials = await readSharedState()
  const admin = await loginViaApi(request, { email: credentials.adminEmail, password: credentials.adminPassword })
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const json = async (response) => {
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  const source = await json(await request.post(resolveBackendUrl('/channels'), {
    headers,
    data: { name: `Guest link access ${Date.now()}`, type: 'private', is_voice: false }
  }))
  const meeting = await json(await request.post(resolveBackendUrl('/meetings'), {
    headers,
    data: { source_channel_id: source.id, title: 'Guest link access' }
  }))
  const meetingUrl = resolveBackendUrl(`/meetings/${meeting.id}`)
  const updateMeeting = (data) => request.patch(meetingUrl, { headers, data })
  let inviteTab

  try {
    const linked = await json(await updateMeeting({ action: 'create_invite_link' }))
    const invitePath = new URL(linked.guest_invite_link.join_url).pathname
    await (await openLoginForm(page)).fill(credentials.inviteEmail)
    await page.getByTestId('login-password').fill(credentials.invitePassword)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('message-input-textarea')).toBeVisible()
    const originalSession = await getAuthFromBrowserSession(page)
    expect(originalSession.user.is_admin).not.toBe(true)

    inviteTab = await page.context().newPage()
    const guestAccepts = []
    inviteTab.on('request', (outgoing) => {
      if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname.endsWith('/meeting-invite')) {
        guestAccepts.push(outgoing)
      }
    })
    await inviteTab.goto(invitePath)
    await expect(inviteTab.getByTestId('meeting-invite-view')).toContainText(
      /Ask the host to invite you|Bitte den Gastgeber um eine Einladung/
    )
    await expect(inviteTab.getByTestId('meeting-invite-display-name')).toHaveCount(0)
    expect(inviteTab.url()).toBe(new URL(invitePath, page.url()).href)
    const deniedSession = await getAuthFromBrowserSession(inviteTab)
    expect(deniedSession.user.id).toBe(originalSession.user.id)

    await json(await updateMeeting({ action: 'invite', user_ids: [originalSession.user.id] }))
    await inviteTab.reload()
    await expect(inviteTab).toHaveURL(new URL(`/meetings/${meeting.id}`, page.url()).href)
    const joinCall = inviteTab.getByTestId('meeting-view').getByRole('button', { name: /Join call|Anruf beitreten/ })
    await expect(joinCall).toBeVisible()
    await expect(inviteTab.getByTestId('voice-status-connected')).toHaveCount(0)
    const openedSession = await getAuthFromBrowserSession(inviteTab)
    expect(openedSession.user.id).toBe(originalSession.user.id)
    expect(guestAccepts).toHaveLength(0)

    await joinCall.click()
    await expect(inviteTab.getByTestId('voice-status-connected')).toBeVisible()
  } finally {
    await inviteTab?.close()
    await updateMeeting({ action: 'end' }).catch(() => {})
  }
})
