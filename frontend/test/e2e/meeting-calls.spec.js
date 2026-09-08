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
    await expect(page.getByTestId('outgoing-call')).toHaveCount(0, { timeout: 35_000 })
    await expect(page.getByTestId('call-history-entry')).toHaveCount(3)

    await start()
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
