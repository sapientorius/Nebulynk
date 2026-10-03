import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import knex from 'knex'
import bcrypt from 'bcryptjs'
import { createId } from '@paralleldrive/cuid2'
import { encryptSecret } from '../../../backend/src/lib/ai-secrets.js'
import { ensureAdmin } from './bootstrap.js'

const isolated = process.env.NEBULYNK_TEST_POSTGRES_ISOLATED === 'true'
const password = 'SummaryTestPassw0rd!'
const original = { language: 'de', mini_summary: 'Falscher Begriff.', summary_points: ['Falscher Begriff.'], decisions: [], open_items: [], topic_chapters: [], markdown: 'Falscher Begriff.' }

async function login(page, email, loginPassword = password) {
  await page.goto('/login')
  await page.getByTestId('login-email').fill(email)
  await page.getByTestId('login-password').fill(loginPassword)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('app-view')).toBeVisible()
}

async function installRecorder(page) {
  await page.addInitScript(() => {
    class Recorder {
      constructor(stream, options = {}) { this.stream = stream; this.state = 'inactive'; this.mimeType = options.mimeType || 'audio/webm' }
      static isTypeSupported() { return true }
      start() { this.state = 'recording' }
      stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.() }
    }
    window.MediaRecorder = Recorder
    const mediaDevices = {
      getUserMedia: async () => {
        const track = { kind: 'audio', enabled: true, readyState: 'live', stop() { this.readyState = 'ended' } }
        return { active: true, id: 'summary-audio', getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [], addEventListener() {}, removeEventListener() {} }
      }
    }
    Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => mediaDevices })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, get: () => mediaDevices })
  })
}

test.describe('AI meeting summary revisions with real backend', () => {
  test.skip(!isolated, 'Requires the isolated CI E2E database; never seeds an application database.')
  let db, provider, providerId, savedConfigs, meetingId, hostId, readerId, adminId, hostEmail, readerEmail, sourceId, chatId, admin
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone'])
    await ensureAdmin(page, { platformName: 'Summary revision tests', adminDisplayName: 'Revision Admin', adminEmail: `revision-admin-${createId()}@example.com`, adminPassword: password })
    const database = process.env.E2E_POSTGRES_DB
    if (database !== 'nebulynk_ci_e2e') throw new Error('Expected the isolated CI E2E database')
    db = knex({ client: 'pg', connection: { host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database } })
    meetingId = createId(); hostId = createId(); readerId = createId(); adminId = createId(); sourceId = createId(); chatId = createId(); providerId = createId()
    hostEmail = `summary-host-${hostId}@example.com`; readerEmail = `summary-reader-${readerId}@example.com`
    admin = { email: `summary-admin-${adminId}@example.com`, password }
    const hashed = await bcrypt.hash(password, 10)
    await db('users').insert([{ id: hostId, email: hostEmail, display_name: 'Summary Host', is_admin: false }, { id: readerId, email: readerEmail, display_name: 'Summary Reader', is_admin: false }, { id: adminId, email: admin.email, display_name: 'Summary Admin', is_admin: true }].map(user => ({ ...user, password: hashed, webauthn_user_id: user.id })))
    await db('channels').insert([{ id: sourceId, name: 'Summary source', type: 'private' }, { id: chatId, name: 'Summary meeting', type: 'private', purpose: 'meeting', is_archived: true }])
    await db('meetings').insert({ id: meetingId, host_user_id: hostId, source_channel_id: sourceId, chat_channel_id: chatId, status: 'ended', title: 'Summary corrections', language: 'de', ended_at: new Date() })
    await db('meeting_participants').insert([hostId, readerId].map(id => ({ id: createId(), meeting_id: meetingId, user_id: id, role: id === hostId ? 'host' : 'participant', joined_at: new Date() })))
    await db('channel_members').insert([sourceId, chatId].flatMap(channelId => [hostId, readerId].map(userId => ({ id: createId(), channel_id: channelId, user_id: userId }))))
    await db('meeting_artifacts').insert({ id: createId(), meeting_id: meetingId, artifact_type: 'summary', status: 'ready', payload: original })
    await db('messages').insert({ id: createId(), channel_id: chatId, user_id: hostId, type: 'text', content: 'Falscher Begriff.' })
    let regenerationCount = 0
    provider = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      res.setHeader('Content-Type', 'application/json')
      if (req.url.endsWith('/audio/transcriptions')) return res.end(JSON.stringify({ text: 'Bitte den Begriff korrigieren.', language: 'de' }))
      const request = JSON.parse(body)
      const prompt = JSON.parse(request.messages.at(-1).content)
      const refined = prompt.editor_instructions?.includes('Kontext')
      const result = prompt.previous_summary
        ? { ...original, mini_summary: `Neu erstellte Zusammenfassung ${++regenerationCount}.`, change_summary: 'Zusammenfassung aus Meeting-Inhalten neu erstellt.' }
        : { ...original, mini_summary: refined ? 'Richtiger Begriff mit Kontext.' : 'Richtiger Begriff.', summary_points: ['Richtiger Begriff.'], change_summary: refined ? 'Begriff korrigiert und Kontext ergänzt.' : 'Begriff korrigiert.' }
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
    })
    await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
    savedConfigs = await db('ai_function_configs').whereIn('function_key', ['meeting_summary', 'transcription'])
    await db('ai_provider_instances').insert({ id: providerId, provider_type: 'openai_compatible', display_name: 'Isolated summary test provider', base_url: `http://127.0.0.1:${provider.address().port}/v1`, enabled: true })
    await db('ai_provider_secrets').insert({ provider_instance_id: providerId, encrypted_secret: encryptSecret({ get: key => key === 'authentication' ? { secret: process.env.JWT_SECRET } : null }, 'isolated-test-key') })
    await db('ai_function_configs').where('function_key', 'meeting_summary').update({ enabled: false, provider_instance_id: providerId, model: 'test-summary' })
    await db('ai_function_configs').where('function_key', 'transcription').update({ enabled: true, provider_instance_id: providerId, model: 'whisper-1' })
    await installRecorder(page)
    await login(page, hostEmail)
    await page.goto(`/meetings/${meetingId}`)
    await expect(page.getByTestId('meeting-summary-panel')).toContainText('Falscher Begriff.')
  })
  test.afterEach(async () => {
    try {
      if (savedConfigs) for (const row of savedConfigs) await db('ai_function_configs').where('function_key', row.function_key).update(row)
      if (providerId) await db('ai_provider_instances').where('id', providerId).delete()
      if (meetingId) await db('meetings').where('id', meetingId).delete()
      if (chatId) await db('messages').where('channel_id', chatId).delete()
      if (chatId) await db('channels').whereIn('id', [chatId, sourceId]).delete()
      if (hostId) await db('users').whereIn('id', [hostId, readerId, adminId]).delete()
    } finally { await db?.destroy(); if (provider) await new Promise(resolve => provider.close(resolve)) }
  })

  for (const mobile of [false, true]) test(`text, dictation, refinements, publication and suppression (${mobile ? 'mobile' : 'desktop'})`, async ({ page, browser }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('summary-edit-open').click()
    await page.getByTestId('instruction-voice-to-text').click()
    await page.getByTestId('voice-recorder-stop').click()
    await page.getByTestId('voice-recorder-submit').click()
    await expect(page.getByTestId('instruction-input-textarea')).toHaveValue('Bitte den Begriff korrigieren.')
    await expect(page.getByTestId('summary-edit-preview')).toHaveCount(0)
    await page.getByTestId('instruction-submit').click()
    await expect(page.getByTestId('summary-edit-preview')).toContainText('Richtiger Begriff.')
    await expect(page.getByTestId('meeting-summary-panel').first()).toContainText('Falscher Begriff.')
    await page.getByTestId('instruction-input-textarea').fill('Kontext ergänzen')
    await page.getByTestId('instruction-submit').click()
    await expect(page.getByTestId('summary-edit-preview')).toContainText('Richtiger Begriff mit Kontext.')
    await page.getByTestId('summary-edit-apply').click()
    await expect(page.getByTestId('meeting-summary-editor')).toHaveCount(0)
    await expect(page.getByTestId('meeting-summary-panel')).toContainText('Richtiger Begriff mit Kontext.')
    await expect(page.getByTestId('summary-change-entry')).toContainText('Begriff korrigiert und Kontext ergänzt.')

    const readerContext = await browser.newContext(), reader = await readerContext.newPage()
    try {
      await login(reader, readerEmail)
      await reader.goto(`/meetings/${meetingId}`)
      await expect(reader.getByTestId('summary-change-entry')).toContainText('Begriff korrigiert und Kontext ergänzt.')
      await expect(reader.getByTestId('summary-edit-open')).toHaveCount(0)
      await page.getByTestId('summary-edit-open').click()
      await page.getByTestId('instruction-input-textarea').fill('Begriff korrigieren')
      await page.getByTestId('instruction-submit').click()
      await expect(page.getByTestId('summary-edit-preview')).toBeVisible()
      await page.getByTestId('summary-edit-publish').click()
      await page.getByTestId('summary-edit-apply').click()
      await expect(page.getByTestId('meeting-summary-editor')).toHaveCount(0)
      await expect(reader.getByTestId('meeting-summary-panel')).toContainText('Richtiger Begriff.')
      await expect(reader.getByTestId('summary-change-entry')).toHaveCount(1)
    } finally { await readerContext.close().catch(() => {}) }
  })

  test('admin regeneration warns before replacing corrections and supports suppressing its history entry', async ({ page, browser }) => {
    await page.getByTestId('summary-edit-open').click()
    await page.getByTestId('instruction-input-textarea').fill('Begriff korrigieren')
    await page.getByTestId('instruction-submit').click()
    await expect(page.getByTestId('summary-edit-preview')).toBeVisible()
    await page.getByTestId('summary-edit-apply').click()
    await expect(page.getByTestId('summary-change-entry')).toHaveCount(1)
    await expect(page.getByTestId('meeting-admin-artifact-menu-trigger')).toHaveCount(0)
    const adminContext = await browser.newContext(), adminPage = await adminContext.newPage()
    try {
      await login(adminPage, admin.email, admin.password)
      await adminPage.goto(`/meetings/${meetingId}`)
      for (const publish of [true, false]) {
        await adminPage.getByTestId('meeting-admin-artifact-menu-trigger').click()
        await adminPage.getByTestId('meeting-admin-regenerate-summary').click()
        await expect(adminPage.getByTestId('summary-regenerate-publish')).toHaveAttribute('aria-checked', 'true')
        await expect(adminPage.locator('.n-dialog')).toContainText(/corrections may be lost|Korrekturen können verloren gehen/)
        if (!publish) await adminPage.getByTestId('summary-regenerate-publish').click()
        await adminPage.getByTestId('summary-regenerate-confirm').click()
        await expect(adminPage.getByTestId('meeting-summary-panel')).toContainText(`Neu erstellte Zusammenfassung ${publish ? 1 : 2}.`, { timeout: 30_000 })
        await expect(adminPage.getByTestId('summary-change-entry')).toHaveCount(2)
        await expect(page.getByTestId('summary-change-entry')).toHaveCount(2)
      }
    } finally { await adminContext.close().catch(() => {}) }
  })
})
