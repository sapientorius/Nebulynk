import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SMTP admin settings sources', () => {
  it('adds a dedicated SMTP settings panel with save and test actions', () => {
    const source = readFileSync(resolve('src/components/admin/SmtpSettings.vue'), 'utf8')

    expect(source).toContain('data-testid="smtp-settings-panel"')
    expect(source).toContain(':label="$t(\'ui.components.admin.smtp_host\')"')
    expect(source).toContain(':label="$t(\'ui.components.admin.smtp_port\')"')
    expect(source).toContain(':label="$t(\'ui.components.admin.smtp_user\')"')
    expect(source).toContain(':label="$t(\'ui.components.admin.smtp_password\')"')
    expect(source).toContain('data-testid="smtp-save-button"')
    expect(source).toContain('data-testid="smtp-test-connection-button"')
    expect(source).toContain('data-testid="smtp-send-test-mail-button"')
    expect(source).toContain("this.adminStore.updateSmtpSettings(this.buildSavePayload())")
    expect(source).toContain('this.adminStore.testSmtpConnection()')
    expect(source).toContain('this.adminStore.sendSmtpTestEmail({')
  })

  it('exposes SMTP API helpers and admin-store bindings', () => {
    const apiSource = readFileSync(resolve('src/lib/api.js'), 'utf8')
    const storeSource = readFileSync(resolve('src/stores/admin.js'), 'utf8')

    expect(apiSource).toContain("api.get('/smtp-settings')")
    expect(apiSource).toContain("api.patch('/smtp-settings', payload)")
    expect(apiSource).toContain("action: 'test_connection'")
    expect(apiSource).toContain("action: 'send_test_email'")

    expect(storeSource).toContain('const smtpSettings = ref({})')
    expect(storeSource).toContain('const loadingSmtpSettings = ref(false)')
    expect(storeSource).toContain('async function refreshSmtpSettings()')
    expect(storeSource).toContain('async function updateSmtpSettings(payload)')
    expect(storeSource).toContain('async function testSmtpConnection()')
    expect(storeSource).toContain('async function sendSmtpTestEmail(payload)')
  })
})
