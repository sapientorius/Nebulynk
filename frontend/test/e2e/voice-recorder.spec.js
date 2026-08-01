import { expect, test } from '@playwright/test'
import { getAuthFromBrowserSession } from './auth-helpers.js'
import { ensureAdmin } from './bootstrap.js'
import { resolveBackendUrl } from './test-urls.js'

const runId = Date.now().toString(36)
const adminEmail = `voice.recorder.${runId}@example.com`
const adminPassword = 'AdminPassw0rd!'
const adminDisplayName = 'Voice Recorder Admin'
const platformName = `Nebulynk Voice Recorder ${runId}`

async function installMediaRecorderStub(page) {
  await page.addInitScript(() => {
    window.__voiceRecorderStarts = 0
    window.__voiceRecorderStops = 0

    class MockMediaRecorder {
      constructor(stream, options = {}) {
        this.stream = stream
        this.mimeType = options.mimeType || 'audio/webm'
        this.state = 'inactive'
        this.ondataavailable = null
        this.onstop = null
      }

      start() {
        this.state = 'recording'
        window.__voiceRecorderStarts += 1
      }

      stop() {
        if (this.state === 'inactive') return
        this.state = 'inactive'
        this.ondataavailable?.({
          data: new Blob(['voice'], { type: this.mimeType })
        })
        this.onstop?.()
      }

      static isTypeSupported() {
        return true
      }
    }

    const mediaDevices = {
      getUserMedia: async () => {
        const audioTrack = {
          kind: 'audio',
          enabled: true,
          readyState: 'live',
          stop: () => {
            window.__voiceRecorderStops += 1
            audioTrack.readyState = 'ended'
          }
        }

        return {
          active: true,
          id: 'mock-audio-stream',
          getTracks: () => [audioTrack],
          getAudioTracks: () => [audioTrack],
          getVideoTracks: () => [],
          addEventListener: () => {},
          removeEventListener: () => {}
        }
      }
    }

    Object.defineProperty(Navigator.prototype, 'mediaDevices', {
      configurable: true,
      get: () => mediaDevices
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      get: () => mediaDevices
    })

    window.MediaRecorder = MockMediaRecorder
  })
}

async function login(page, { email, password }) {
  await page.goto('/login')
  await expect(page.getByTestId('login-view')).toBeVisible()
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/channels/)
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function resolveDefaultPublicChannelId(page, accessToken) {
  const response = await page.request.get(resolveBackendUrl('/channels?discover_public=true&$limit=100'), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok()) {
    throw new Error(`Failed to resolve default channel (${response.status()})`)
  }

  const payload = await response.json()
  const channels = Array.isArray(payload) ? payload : payload?.data || []
  const defaultTextChannel = channels.find((channel) => !channel.is_voice && channel.purpose === 'default')
  const fallbackChannel = channels.find((channel) => !channel.is_voice) || channels[0]
  return (defaultTextChannel || fallbackChannel)?.id || null
}

async function openRecordingMode(page, testId) {
  await page.getByTestId('message-voice-menu-trigger').click()
  await page.getByTestId(testId).click()
  await expect(page.getByTestId('voice-recorder')).toBeVisible()
  await expect(page.getByTestId('voice-recording-sphere')).toBeVisible()
  await expect(page.getByTestId('voice-recorder-stop')).toBeVisible()
  await expect(page.getByTestId('voice-recorder-start')).toHaveCount(0)
}

test.describe('voice recorder e2e', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await installMediaRecorderStub(page)
  })

  test('auto-starts recording for voice message and voice-to-text modes', async ({ page }) => {
    const admin = await ensureAdmin(page, {
      platformName,
      adminDisplayName,
      adminEmail,
      adminPassword
    })
    await login(page, admin)

    const authResult = await getAuthFromBrowserSession(page)
    const accessToken = authResult.accessToken
    expect(accessToken).toBeTruthy()
    const channelId = await resolveDefaultPublicChannelId(page, accessToken)
    expect(channelId).toBeTruthy()

    await page.goto(`/channels/${channelId}`)
    await expect(page.getByTestId('message-input')).toBeVisible()

    await openRecordingMode(page, 'message-voice-message')
    await expect.poll(() => page.evaluate(() => window.__voiceRecorderStarts)).toBe(1)
    await page.getByTestId('voice-recorder-cancel').click()
    await expect(page.getByTestId('voice-recorder')).toBeHidden()

    await openRecordingMode(page, 'message-voice-to-text')
    await expect.poll(() => page.evaluate(() => window.__voiceRecorderStarts)).toBe(2)
    await page.getByTestId('voice-recorder-cancel').click()
    await expect(page.getByTestId('voice-recorder')).toBeHidden()
  })
})
