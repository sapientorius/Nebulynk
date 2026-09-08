import { expect, test } from '@playwright/test'
import { readSharedState } from './shared-state.js'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { resolveBackendUrl } from './test-urls.js'

test('meeting screenshare maximization and chat overlay reset after navigation', async ({ page }) => {
  // Deterministic browser MediaStream; this proves UI/browser wiring, not LiveKit delivery.
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 360
      const context = canvas.getContext('2d')
      context.fillStyle = '#334455'
      context.fillRect(0, 0, 640, 360)
      return canvas.captureStream(1)
    }
  })
  const credentials = await readSharedState()
  await page.goto('/login')
  await page.getByTestId('login-email').fill(credentials.adminEmail)
  await page.getByTestId('login-password').fill(credentials.adminPassword)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels\/[^/?#]+$/)
  await expect(page.getByTestId('message-input-textarea')).toBeVisible()
  const auth = await getAuthFromBrowserSession(page, credentials)
  const response = await page.request.post(resolveBackendUrl('/channels'), {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
    data: { name: `share-${Date.now()}`, type: 'private' }
  })
  expect(response.ok()).toBe(true)
  const channel = await response.json()
  await page.goto(`/channels/${channel.id}`)
  await page.getByRole('button', { name: /^Call$|^Anrufen$/ }).click()
  await expect(page.getByTestId('meeting-view')).toBeVisible()
  const meetingUrl = page.url()
  await page.getByTestId('meeting-share-trigger-idle').click()
  await page.getByTestId('meeting-start-screen-share').click()
  await expect(page.getByTestId('meeting-screen-share-panel')).toBeVisible()
  await page.getByTestId('meeting-maximize-screen-share').click()
  await expect(page.getByTestId('meeting-restore-screen-share')).toBeVisible()
  await page.getByTestId('meeting-show-screen-share-chat').click()
  await expect(page.getByTestId('meeting-screen-share-chat-overlay')).toBeVisible()
  await page.getByTestId('meeting-hide-screen-share-chat-overlay').click()
  await expect(page.getByTestId('meeting-screen-share-chat-overlay')).toBeHidden()
  await page.getByTestId('meeting-restore-screen-share').click()
  await page.getByTestId('meeting-hide-screen-share-panel').click()
  await expect(page.getByTestId('meeting-screen-share-panel')).toBeHidden()
  await page.getByTestId('meeting-share-trigger-active').click()
  await expect(page.getByTestId('meeting-screen-share-panel')).toBeVisible()
  await page.getByTestId('meeting-stop-screen-share').click()
  await expect(page.getByTestId('meeting-screen-share-panel')).toBeHidden()
  await page.goto(`/channels/${channel.id}`)
  await expect(page.getByTestId('app-view')).toBeVisible()
  await page.goto(meetingUrl)
  await expect(page.getByTestId('meeting-screen-share-chat-overlay')).toHaveCount(0)
  await expect(page.getByTestId('meeting-restore-screen-share')).toHaveCount(0)
  await page.getByRole('button', { name: /^End meeting$|^Meeting beenden$/ }).click()
})
