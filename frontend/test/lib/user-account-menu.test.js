import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildQuickStatusPayload, canAccessAdmin } from '../../src/lib/user-account-menu.js'

describe('user account menu helpers', () => {
  it('builds a quick status payload without a status expiry', () => {
    expect(buildQuickStatusPayload('away')).toEqual({
      status: 'away',
      status_expires_at: null
    })
  })

  it('recognizes admin visibility from existing permissions', () => {
    expect(canAccessAdmin({
      can(permission) {
        return permission === 'manage_users'
      }
    })).toBe(true)

    expect(canAccessAdmin({
      can() {
        return false
      }
    })).toBe(false)
  })

  it('keeps guest users on a reduced account menu', () => {
    const source = readFileSync(resolve('src/components/UserAccountMenu.vue'), 'utf8')

    expect(source).toContain("import { getPresenceStatusColor } from '../lib/user-presence.js'")
    expect(source).toContain('userPresence() {')
    expect(source).toContain('return this.sessionStore.resolveUserPresence(this.user)')
    expect(source).toContain("isGuestUser()")
    expect(source).toContain('v-if="!isGuestUser"')
    expect(source).toContain('data-testid="user-menu-logout"')
    expect(source).toContain('data-testid="user-menu-open-settings"')
    expect(source).toContain('data-testid="user-menu-open-notes"')
    expect(source).toContain('this.dmsStore.openNotes()')
    expect(source).toContain('data-testid="user-menu-open-admin"')
    expect(source).toContain('data-testid="user-menu-open-status-picker"')
  })

  it('shows a managed-registration badge and direct registration-settings action for user managers', () => {
    const source = readFileSync(resolve('src/components/UserAccountMenu.vue'), 'utf8')

    expect(source).toContain('pendingRegistrationAlertCount')
    expect(source).toContain('canManageUsers && pendingRegistrationAlertCount > 0')
    expect(source).toContain('data-testid="user-menu-open-pending-registrations"')
    expect(source).toContain("tab: 'registration'")
    expect(source).toContain('selfRegistrationAdmin.pendingMenuOne')
    expect(source).toContain('selfRegistrationAdmin.pendingMenuMany')
  })
})
