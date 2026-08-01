import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('UserRoleManager source contract', () => {
  it('shows 2FA, passkey, and primary-admin controls in the admin user table', () => {
    const source = readFileSync(resolve('src/components/admin/UserRoleManager.vue'), 'utf8')

    expect(source).toContain("twoFactor.admin.column")
    expect(source).toContain("twoFactor.admin.enabled")
    expect(source).toContain("twoFactor.admin.disabled")
    expect(source).toContain("twoFactor.admin.resetAction")
    expect(source).toContain("window.confirm(this.$t('twoFactor.admin.resetConfirm'))")
    expect(source).toContain('admin-user-reset-2fa-${user.id}')
    expect(source).toContain('await this.adminStore.resetUserTwoFactor(user.id)')
    expect(source).toContain("passkeys.admin.column")
    expect(source).toContain("passkeys.admin.enabledCount")
    expect(source).toContain("passkeys.admin.disabled")
    expect(source).toContain("passkeys.admin.resetAction")
    expect(source).toContain("window.confirm(this.$t('passkeys.admin.resetConfirm'))")
    expect(source).toContain('admin-user-reset-passkeys-${user.id}')
    expect(source).toContain('await this.adminStore.resetUserPasskeys(user.id)')
    expect(source).toContain("primaryAdmin.badge")
    expect(source).toContain('admin-user-primary-admin-${user.id}')
    expect(source).toContain('admin-user-transfer-primary-admin-${user.id}')
    expect(source).toContain('data-testid="primary-admin-transfer-warning"')
    expect(source).toContain('TRANSFER_PRIMARY_ADMIN')
    expect(source).toContain('await startAuthentication({')
    expect(source).toContain('this.adminStore.beginPrimaryAdminTransferPasskeyOptions()')
    expect(source).toContain('this.adminStore.transferPrimaryAdmin({')
  })
})
