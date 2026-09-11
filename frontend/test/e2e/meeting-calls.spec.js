import { expect, test } from '@playwright/test'
import { readSharedState } from './shared-state.js'
import { loginViaApi } from './auth-helpers.js'
import { resolveBackendUrl } from './test-urls.js'


async function login(page, email, password) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels\/[^/?#]+$/)
  await expect(page.getByTestId('message-input-textarea')).toBeVisible()
}

test('direct calls ring before meeting creation, preserve unsuccessful history and connect both browsers on acceptance', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const credentials = await readSharedState()
  await login(page, credentials.adminEmail, credentials.adminPassword)
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin })
  const other = await otherContext.newPage()
  other.setDefaultTimeout(10000)
  try {
    await login(other, credentials.inviteEmail, credentials.invitePassword)
    const adminAuth = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
    const memberAuth = await loginViaApi(other.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
    const headers = { Authorization: `Bearer ${adminAuth.accessToken}` }
    const response = await page.request.post(resolveBackendUrl('/dms'), { headers, data: { user_ids: [memberAuth.user.id] } })
    expect(response.ok()).toBe(true)
    const dm = await response.json()
    await page.goto(`/channels/${dm.id}`)
    await other.goto(`/channels/${dm.id}`)
    const start = async () => {
      await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
      await expect(page.getByTestId('outgoing-call')).toBeVisible()
      await expect(other.getByTestId('incoming-meeting-call')).toBeVisible()
      await expect(other.getByTestId('chat-call-banner')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/channels/${dm.id}$`))
      const meetings = await page.request.get(resolveBackendUrl(`/meetings?source_channel_id=${dm.id}&include_ended=true`), { headers })
      const payload = await meetings.json()
      expect(Array.isArray(payload) ? payload : payload.data).toHaveLength(0)
    }
    await start()
    await page.getByTestId('outgoing-call').getByRole('button', { name: /^Cancel$|^Abbrechen$/ }).click()
    await expect(other.getByTestId('incoming-meeting-call')).toHaveCount(0)
    await expect(page.getByTestId('call-history-entry')).toHaveCount(1)

    await page.getByTestId('call-history-entry').getByRole('button', { name: /Call again|Erneut anrufen/ }).click()
    await expect(other.getByTestId('incoming-meeting-call')).toBeVisible()
    await other.getByTestId('incoming-meeting-call').getByRole('button', { name: /Decline|Ablehnen/ }).click()
    await expect(page.getByTestId('outgoing-call')).toHaveCount(0)
    await expect(page.getByTestId('call-history-entry')).toHaveCount(2)

    await start()
    // Reload recovers signaling from the server without creating a meeting or resetting the deadline.
    await other.reload()
    await expect(other.getByTestId('incoming-meeting-call')).toBeVisible()
    await expect(page.getByTestId('outgoing-call')).toHaveCount(0, { timeout: 65_000 })
    await expect(page.getByTestId('call-history-entry')).toHaveCount(3)

    await start()
    // A notification opens the source chat; it does not accept on the user's behalf.
    const attemptsResponse = await page.request.get(resolveBackendUrl('/meeting-calls'), { headers })
    const attempt = (await attemptsResponse.json()).find(call => call.source_channel_id === dm.id && call.status === 'ringing')
    await other.goto('/channels')
    await expect(other.getByTestId('message-input-textarea')).toBeVisible()
    await other.getByTestId('open-notifications-panel').click()
    await expect(other.getByTestId('notifications-panel-body')).toBeVisible()
    await other.locator(`[data-testid="notification-item"][data-call-id="${attempt.id}"]`).click()
    await expect(other).toHaveURL(new RegExp(`/channels/${dm.id}$`))
    await other.getByTestId('chat-call-banner').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(other.getByTestId('meeting-view')).toBeVisible()
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(new URL(other.url()).pathname)
    await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
    await page.goto(`/channels/${dm.id}`)
    await other.goto(`/channels/${dm.id}`)
    await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
    await expect(other.getByTestId('incoming-meeting-call')).toBeVisible()
    await other.getByTestId('incoming-meeting-call').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(other.getByTestId('meeting-view')).toBeVisible()
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(new URL(other.url()).pathname)
    const meetingId = new URL(page.url()).pathname.split('/').pop()
    await expect.poll(async () => {
      const res = await page.request.get(resolveBackendUrl(`/meetings/${meetingId}`), { headers })
      const meeting = await res.json()
      return meeting.participants.filter(participant => participant.invite_status === 'joined').length
    }).toBe(2)
    await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
  } finally {
    await otherContext.close()
  }
})

test('a connected participant hides the ready-call overlay outside the meeting and reopens it without rejoining', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const credentials = await readSharedState()
  await login(page, credentials.adminEmail, credentials.adminPassword)
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    const recipient = await context.newPage()
    await login(recipient, credentials.inviteEmail, credentials.invitePassword)
    const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
    const member = await loginViaApi(recipient.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
    const response = await page.request.post(resolveBackendUrl('/dms'), {
      headers: { Authorization: `Bearer ${admin.accessToken}` }, data: { user_ids: [member.user.id] }
    })
    expect(response.ok()).toBe(true)
    const dm = await response.json()
    await page.goto(`/channels/${dm.id}`)
    await recipient.goto(`/channels/${dm.id}`)
    await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
    await recipient.getByTestId('incoming-meeting-call').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    await expect(recipient.getByTestId('meeting-view')).toBeVisible()

    let repeatedJoinRequests = 0
    page.on('request', request => {
      if (request.method() === 'PATCH'
        && /\/meetings\/[^/?]+$/.test(request.url())
        && request.postData()?.includes('"action":"join"')) {
        repeatedJoinRequests++
      }
    })

    await page.locator('.dm-item').filter({ has: page.getByText(member.user.display_name, { exact: true }) }).last().click()
    await expect(page).toHaveURL(new RegExp(`/channels/${dm.id}$`))
    await expect(page.getByTestId('voice-status-connected')).toBeVisible()
    await expect(page.getByTestId('outgoing-call')).toHaveCount(0)

    await page.locator('.voice-channel-link').click()
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    await expect(page.getByTestId('voice-status-connected')).toBeVisible()
    expect(repeatedJoinRequests).toBe(0)

    await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
  } finally {
    await context.close()
  }
})

test('group recipients share one meeting and retain one invitation after the first acceptance', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const credentials = await readSharedState()
  await login(page, credentials.adminEmail, credentials.adminPassword)
  const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
  const headers = { Authorization: `Bearer ${admin.accessToken}` }
  const contexts = await Promise.all([browser.newContext({ baseURL: new URL(page.url()).origin }), browser.newContext({ baseURL: new URL(page.url()).origin })])
  try {
    const [second, third] = await Promise.all(contexts.map(context => context.newPage()))
    await login(second, credentials.inviteEmail, credentials.invitePassword)
    const member = await loginViaApi(second.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
    const email = `call.third.${Date.now()}@example.com`
    const password = credentials.invitePassword
    const inviteResponse = await page.request.post(resolveBackendUrl('/invites'), { headers,
      data: { email, role_to_assign: 'platform:member', expires_in: 86400000 } })
    expect(inviteResponse.ok()).toBe(true)
    const invite = await inviteResponse.json()
    await third.goto(`/invite/${invite.token}`)
    await third.getByTestId('invite-display-name').fill('Third Call Participant')
    await third.getByTestId('invite-password').fill(password)
    await third.getByTestId('invite-password-confirm').fill(password)
    await third.getByTestId('invite-accept-submit').click()
    await expect(third.getByTestId('invite-success-go-login')).toBeVisible()
    await login(third, email, password)
    const thirdAuth = await loginViaApi(third.request, { email, password })
    const response = await page.request.post(resolveBackendUrl('/dms'), { headers, data: { user_ids: [member.user.id, thirdAuth.user.id] } })
    expect(response.ok()).toBe(true)
    const group = await response.json()
    await Promise.all([page, second, third].map(view => view.goto(`/channels/${group.id}`)))
    await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
    await expect(second.getByTestId('incoming-meeting-call')).toHaveCount(1)
    await expect(third.getByTestId('incoming-meeting-call')).toHaveCount(1)
    const callsResponse = await page.request.get(resolveBackendUrl('/meeting-calls'), { headers })
    const attempt = (await callsResponse.json()).find(call => call.source_channel_id === group.id)
    expect(attempt.meeting_id).toBeNull()
    await second.getByTestId('chat-call-banner').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(second.getByTestId('meeting-view')).toBeVisible()
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    await expect(third.getByTestId('incoming-meeting-call')).toHaveCount(1)
    await expect(third.getByTestId('incoming-call-overlay')).toHaveCount(0)
    await expect(third.getByTestId('chat-call-banner')).toBeVisible()
    const updated = await page.request.get(resolveBackendUrl(`/meeting-calls/${attempt.id}`), { headers })
    expect((await updated.json()).expires_at).toBe(attempt.expires_at)
    await third.getByTestId('incoming-meeting-call').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(third.getByTestId('meeting-view')).toBeVisible()
    expect(new URL(third.url()).pathname).toBe(new URL(page.url()).pathname)
    const meetings = await page.request.get(resolveBackendUrl(`/meetings?source_channel_id=${group.id}&include_ended=true`), { headers })
    const payload = await meetings.json()
    expect(Array.isArray(payload) ? payload : payload.data).toHaveLength(1)
    await expect(third.getByTestId('incoming-meeting-call')).toHaveCount(0)
    await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('caller recovers a lost acceptance on foreground return', async ({ page, browser }) => {
  const credentials = await readSharedState()
  let droppedEvents = 0
  await page.routeWebSocket(/socket\.io\//, socket => {
    const server = socket.connectToServer()
    server.onMessage(message => {
      const payload = message.toString()
      if (payload.includes('meeting-calls changed') || (payload.includes('messages created') && payload.includes('"call_id"'))) {
        droppedEvents++
        return
      }
      socket.send(message)
    })
  })
  await login(page, credentials.adminEmail, credentials.adminPassword)
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin })
  try {
    const recipient = await context.newPage()
    await login(recipient, credentials.inviteEmail, credentials.invitePassword)
    const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
    const member = await loginViaApi(recipient.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
    const response = await page.request.post(resolveBackendUrl('/dms'), {
      headers: { Authorization: `Bearer ${admin.accessToken}` }, data: { user_ids: [member.user.id] }
    })
    expect(response.ok()).toBe(true)
    const dm = await response.json()
    await page.goto(`/channels/${dm.id}`)
    await recipient.goto(`/channels/${dm.id}`)
    await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
    await expect(page.getByTestId('outgoing-call')).toBeVisible()
    await expect(recipient.getByTestId('incoming-meeting-call')).toBeVisible()
    await recipient.getByTestId('incoming-meeting-call').getByRole('button', { name: /Accept|Annehmen/ }).click()
    await expect(recipient.getByTestId('meeting-view')).toBeVisible()
    // The caller deliberately missed the realtime events. Foreground resume is
    // the explicit recovery trigger that reloads the current call once.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('meeting-view')).toBeVisible()
    await expect(page.getByTestId('outgoing-call')).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe(new URL(recipient.url()).pathname)
    expect(droppedEvents).toBeGreaterThan(0)
    await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
  } finally {
    await context.close()
  }
})

test('the personal notes channel still starts immediately', async ({ page }) => {
  const credentials = await readSharedState()
  await login(page, credentials.adminEmail, credentials.adminPassword)
  const auth = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
  const response = await page.request.get(resolveBackendUrl('/dms'), { headers: { Authorization: `Bearer ${auth.accessToken}` } })
  const payload = await response.json()
  const notes = (Array.isArray(payload) ? payload : payload.data).find(channel => channel.name === 'notes' && channel.created_by === auth.user.id)
  expect(notes).toBeTruthy()
  await page.goto(`/channels/${notes.id}`)
  await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
  await expect(page.getByTestId('meeting-view')).toBeVisible()
  await expect(page.getByTestId('outgoing-call')).toHaveCount(0)
  await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
})

for (const loseEndEvent of [false, true]) {
  test(`ending a meeting clears the other participant connection and source card${loseEndEvent ? ' on foreground return after lost end events' : ' immediately'}`, async ({ page, browser }) => {
    const credentials = await readSharedState()
    await login(page, credentials.adminEmail, credentials.adminPassword)
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin })
    let meetingToEnd = null
    let endHeaders = null
    try {
      const recipient = await context.newPage()
      let dropped = 0
      await recipient.routeWebSocket(/socket\.io\//, socket => {
        const server = socket.connectToServer()
        server.onMessage(message => {
          const payload = message.toString()
          if (loseEndEvent && (payload.includes('meetings ended') || payload.includes('meetings artifacts-'))) {
            dropped++
            return
          }
          socket.send(message)
        })
      })
      await login(recipient, credentials.inviteEmail, credentials.invitePassword)
      const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
      const member = await loginViaApi(recipient.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
      endHeaders = { Authorization: `Bearer ${admin.accessToken}` }
      const response = await page.request.post(resolveBackendUrl('/dms'), {
        headers: { Authorization: `Bearer ${admin.accessToken}` }, data: { user_ids: [member.user.id] }
      })
      expect(response.ok()).toBe(true)
      const dm = await response.json()
      await page.goto(`/channels/${dm.id}`)
      await recipient.goto(`/channels/${dm.id}`)
      await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
      await recipient.getByTestId('incoming-meeting-call').getByRole('button', { name: /Accept|Annehmen/ }).click()
      await expect(page.getByTestId('meeting-view')).toBeVisible()
      await expect(recipient.getByTestId('meeting-view')).toBeVisible()
      const meetingId = new URL(page.url()).pathname.split('/').pop()
      meetingToEnd = meetingId
      // The newest matching DM is the one just created for this scenario.
      // Selecting it through the sidebar keeps the recipient's media session alive.
      await recipient.locator('.dm-item').filter({ has: recipient.getByText(admin.user.display_name, { exact: true }) }).last().click()
      await expect(recipient).toHaveURL(new RegExp(`/channels/${dm.id}$`))
      await expect(recipient.getByTestId('voice-status-connected')).toBeVisible()
      const card = recipient.locator(`[data-testid="meeting-card"][data-meeting-id="${meetingId}"]`)
      await expect(card.getByTestId('meeting-card-join')).toBeVisible()
      // Lost terminal events are reconciled once when the app returns to the foreground.
      await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
      if (loseEndEvent) await recipient.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(recipient.getByTestId('voice-controls')).toHaveCount(0, { timeout: 2000 })
      await expect(card.getByTestId('meeting-card-status')).toHaveText(/Ended|Beendet/)
      await expect(card.getByTestId('meeting-card-join')).toHaveCount(0)
      if (loseEndEvent) expect(dropped).toBeGreaterThan(0)
    } finally {
      if (meetingToEnd) await page.request.patch(resolveBackendUrl(`/meetings/${meetingToEnd}`), {
        headers: endHeaders, data: { action: 'end' }
      }).catch(() => {})
      await context.close()
    }
  })
}


for (const settings of [false, true]) {
  test(`incoming calls reach an idle recipient in ${settings ? 'settings' : 'another channel'} immediately`, async ({ page, browser }) => {
    const credentials = await readSharedState()
    await login(page, credentials.adminEmail, credentials.adminPassword)
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin })
    try {
      const recipient = await context.newPage()
      await recipient.addInitScript(() => {
        window.__callSoundContexts = []
        const start = AudioBufferSourceNode.prototype.start
        AudioBufferSourceNode.prototype.start = function (...args) {
          window.__callSoundContexts.push(this.context)
          return start.apply(this, args)
        }
      })
      let callEvents = 0
      let callReads = 0
      await recipient.routeWebSocket(/socket\.io\//, socket => {
        const server = socket.connectToServer()
        server.onMessage(message => {
          const payload = message.toString()
          if (payload.includes('meeting-calls changed')) callEvents++
          socket.send(message)
        })
      })
      recipient.on('request', request => {
        if (/\/meeting-calls\/[^/?]+$/.test(request.url())) callReads++
      })
      await login(recipient, credentials.inviteEmail, credentials.invitePassword)
      if (settings) {
        await recipient.goto('/settings')
        await expect(recipient.getByTestId('settings-view')).toBeVisible()
      }
      const idleUrl = recipient.url()
      const admin = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
      const member = await loginViaApi(recipient.request, { email: credentials.inviteEmail, password: credentials.invitePassword })
      const response = await page.request.post(resolveBackendUrl('/dms'), {
        headers: { Authorization: `Bearer ${admin.accessToken}` }, data: { user_ids: [member.user.id] }
      })
      expect(response.ok()).toBe(true)
      const dm = await response.json()
      expect(new URL(idleUrl).pathname).not.toBe(`/channels/${dm.id}`)
      await page.goto(`/channels/${dm.id}`)
      const soundCount = await recipient.evaluate(() => window.__callSoundContexts.length)
      // No recipient clicks, navigation or reload from here until the overlay appears.
      await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
      await expect(recipient.getByTestId('incoming-meeting-call')).toBeVisible({ timeout: 2000 })
      expect(recipient.url()).toBe(idleUrl)
      expect(callEvents).toBeGreaterThan(0)
      expect(callReads).toBeGreaterThan(0)
      await expect.poll(() => recipient.evaluate(count => window.__callSoundContexts.slice(count).some(context => context.state === 'running'), soundCount)).toBe(true)
      await expect(recipient.getByTestId('chat-call-banner')).toHaveCount(0)
      await page.getByTestId('outgoing-call').getByRole('button', { name: /^Cancel$|^Abbrechen$/ }).click()
      await expect(recipient.getByTestId('incoming-meeting-call')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
}
