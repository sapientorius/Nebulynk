import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('InviteManager mail delivery messaging', () => {
  it('distinguishes sent, failed, and not-configured invite email states', () => {
    const source = readFileSync(resolve('src/components/admin/InviteManager.vue'), 'utf8')

    expect(source).toContain('lastCreatedInvite.email_sent')
    expect(source).toContain('lastCreatedInvite.email_configured')
    expect(source).toContain("$t('ui.components.admin.smtp_delivery_failed')")
    expect(source).toContain("$t('ui.components.admin.smtp_not_configured')")
    expect(source).toContain('lastCreatedInvite.email_error_message')
    expect(source).toContain("if (this.lastCreatedInvite?.email_sent) return 'success'")
    expect(source).toContain("if (this.lastCreatedInvite?.email_configured) return 'warning'")
  })
})
