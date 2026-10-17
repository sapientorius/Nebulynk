import { expect, test } from '@playwright/test'
import { readSharedState } from './shared-state.js'
import { loginViaApi } from './auth-helpers.js'
import { resolveBackendUrl } from './test-urls.js'

test('a guest-started scheduled meeting appears live at its actual start and stays before later messages', async ({ page, playwright }) => {
  const credentials = await readSharedState()
  await page.goto('/login')
  await page.getByTestId('login-email').fill(credentials.adminEmail)
  await page.getByTestId('login-password').fill(credentials.adminPassword)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('message-input-textarea')).toBeVisible()
  const auth = await loginViaApi(page.request, { email: credentials.adminEmail, password: credentials.adminPassword })
  const headers = { Authorization: `Bearer ${auth.accessToken}` }
  const guestRequest = await playwright.request.newContext()
  let meetingId
  const json = async response => {
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  try {
    const source = await json(await page.request.post(resolveBackendUrl('/channels'), {
      headers, data: { name: `Scheduled card ${Date.now()}`, type: 'private', is_voice: false }
    }))
    await page.goto(`/channels/${source.id}`)
    await expect(page.getByTestId('message-input-textarea')).toBeVisible()
    const before = await json(await page.request.post(resolveBackendUrl('/messages'), {
      headers, data: { channel_id: source.id, content: 'Before scheduled meeting starts' }
    }))
    const plannedTime = new Date(Date.now() + 5 * 60_000).toISOString()
    const meeting = await json(await page.request.post(resolveBackendUrl('/meetings'), {
      headers, data: { source_channel_id: source.id, title: 'Future appointment, current card', scheduled_start_at: plannedTime }
    }))
    meetingId = meeting.id
    const card = page.locator(`[data-testid="meeting-card"][data-meeting-id="${meetingId}"]`)
    await expect(card).toHaveCount(0)
    const invited = await json(await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
      headers, data: { action: 'create_invite_link' }
    }))
    const token = decodeURIComponent(new URL(invited.guest_invite_link.join_url).pathname.split('/').pop())
    await json(await guestRequest.get(resolveBackendUrl(`/meeting-invite?token=${encodeURIComponent(token)}`)))
    await expect(card).toHaveCount(0)
    const guest = await json(await guestRequest.post(resolveBackendUrl('/meeting-invite'), {
      data: { token, display_name: 'Scheduled card guest' }
    }))
    expect(guest.meeting.status).toBe('scheduled')
    await expect(card).toHaveCount(0)
    const guestHeaders = { Authorization: `Bearer ${guest.accessToken}` }
    const joined = await json(await guestRequest.patch(resolveBackendUrl(`/meetings/${meetingId}`), {
      headers: guestHeaders, data: { action: 'join' }
    }))
    expect(joined.meeting.status).toBe('active')
    expect(new Date(joined.meeting.started_at).getTime()).toBeLessThan(new Date(plannedTime).getTime())
    await expect(card).toBeVisible()
    await expect(card.getByTestId('meeting-card-status')).toHaveText(/Active|Aktiv/)
    const messages = await json(await page.request.get(resolveBackendUrl(`/messages?channel_id=${source.id}`), { headers }))
    const reference = (messages.data || messages).find(message => message.content === `[Meeting] /meetings/${meetingId}`)
    expect(reference.user_id).toBe(auth.user.id)
    expect(new Date(reference.created_at).toISOString()).toBe(new Date(joined.meeting.started_at).toISOString())
    const after = await json(await page.request.post(resolveBackendUrl('/messages'), {
      headers, data: { channel_id: source.id, content: 'After scheduled meeting starts' }
    }))
    const assertOrder = async () => {
      await expect(page.getByTestId(`message-${after.id}`)).toBeVisible()
      await expect.poll(() => page.locator('.message-item').evaluateAll(rows => rows.map(row => row.dataset.messageId)))
        .toEqual([before.id, reference.id, after.id])
    }
    await assertOrder()
    await page.reload()
    await expect(card).toBeVisible()
    await assertOrder()
    await json(await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), { headers, data: { action: 'end' } }))
    await expect(card.getByTestId('meeting-card-status')).toHaveText(/Ended|Beendet/)
    await expect(card).toHaveCount(1)
    await assertOrder()
    const endedMessages = await json(await page.request.get(resolveBackendUrl(`/messages?channel_id=${source.id}`), { headers }))
    const endedReference = (endedMessages.data || endedMessages).find(message => message.id === reference.id)
    expect(endedReference.created_at).toBe(reference.created_at)
  } finally {
    if (meetingId) await page.request.patch(resolveBackendUrl(`/meetings/${meetingId}`), { headers, data: { action: 'end' } }).catch(() => {})
    await guestRequest.dispose()
  }
})
