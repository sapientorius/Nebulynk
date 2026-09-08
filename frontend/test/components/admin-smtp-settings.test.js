import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('static source contract: SMTP admin settings sources', () => {
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


})
