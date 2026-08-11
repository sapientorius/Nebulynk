import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('platform update administration UI', () => {
  it('provides the update timeline, acknowledgement, and owner-only risk dialog', () => {
    const source = readFileSync(resolve('src/components/admin/UpdateCenter.vue'), 'utf8')

    expect(source).toContain('data-testid="platform-update-center"')
    expect(source).toContain('v-for="release in status?.releases || []"')
    expect(source).toContain('release.security_applicable')
    expect(source).toContain('release.upgrade?.backup_required')
    expect(source).toContain('release.upgrade?.downtime_expected')
    expect(source).toContain("return value?.en || ''")
    expect(source).toContain("return release.upgrade?.manual_steps?.en || []")
    expect(source).not.toContain('value?.[this.locale]')
    expect(source).toContain('status?.can_manage_checks')
    expect(source).toContain('DISABLE_UPDATE_CHECKS')
    expect(source).toContain(":input-props=\"{ 'data-testid': 'platform-update-disable-confirmation' }\"")
    expect(source).toContain(":input-props=\"{ 'data-testid': 'platform-update-disable-password' }\"")
    expect(source).toContain("method: 'passkey'")
    expect(source).not.toContain('installUpdate')
  })

  it('renders a per-admin update banner and routes details to the dedicated center', () => {
    const source = readFileSync(resolve('src/components/PlatformUpdateBanner.vue'), 'utf8')

    expect(source).toContain('data-testid="platform-update-banner"')
    expect(source).toContain('unacknowledgedSecurityCount')
    expect(source).toContain("path: '/admin'")
    expect(source).toContain("tab: 'updates'")
    expect(source).toContain('acknowledgeAll()')
  })

  it('uses private admin endpoints instead of the public platform service', () => {
    const apiSource = readFileSync(resolve('src/lib/api.js'), 'utf8')
    expect(apiSource).toContain("api.get('/platform-updates')")
    expect(apiSource).toContain("api.post('/platform-updates/check', {})")
    expect(apiSource).toContain("api.patch('/platform-updates/settings', payload)")
    expect(apiSource).not.toContain("getPlatformStatus('/platform-updates')")
  })
})
