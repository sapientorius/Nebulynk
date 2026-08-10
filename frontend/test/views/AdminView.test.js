import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AdminView mobile layout', () => {
  it('switches administration navigation to a mobile drawer layout', () => {
    const source = readFileSync(resolve('src/views/AdminView.vue'), 'utf8')

    expect(source).toContain('data-testid="admin-view"')
    expect(source).toContain("SmtpSettings v-if=\"activeTab === 'smtp'\"")
    expect(source).toContain("AiSettings v-if=\"activeTab === 'ai'\"")
    expect(source).toContain("MeetingSettings v-if=\"activeTab === 'meetings'\"")
    expect(source).toContain("DesignSettings v-if=\"activeTab === 'design'\"")
    expect(source).toContain("label: this.$t('ui.components.admin.design_settings'), key: 'design'")
    expect(source).toContain("label: this.$t('ui.components.admin.smtp_settings'), key: 'smtp'")
    expect(source).toContain("label: this.$t('ui.components.admin.ai_settings'), key: 'ai'")
    expect(source).toContain("label: this.$t('ui.views.meetings'), key: 'meetings'")
    expect(source.indexOf("label: this.$t('ui.components.admin.ai_settings'), key: 'ai'")).toBeLessThan(
      source.indexOf("label: this.$t('ui.views.meetings'), key: 'meetings'")
    )
    expect(source.indexOf("label: this.$t('ui.views.meetings'), key: 'meetings'")).toBeLessThan(
      source.indexOf('const count = this.updatesStore.unacknowledgedCount')
    )
    expect(source).toContain('data-testid="admin-mobile-menu-trigger"')
    expect(source).toContain('data-testid="admin-mobile-menu-drawer"')
    expect(source).toContain('data-testid="admin-mobile-section-label"')
    expect(source).toContain('observeMobileLayout((matches) => {')
    expect(source).toContain('onMenuSelect(value)')
    expect(source).toContain('this.showMobileMenu = false')
    expect(source).toContain("const SPONSORSHIP_URL = 'https://nebulynk.net/sponsorship'")
    expect(source).toContain('isPrimaryAdmin()')
    expect(source).toContain('HeartOutline as HeartIcon')
    expect(source).toContain("class: 'sponsorship-menu-item'")
    expect(source).toContain("class: 'sponsorship-menu-heart'")
    expect(source).toContain("class: 'sponsorship-menu-link'")
    expect(source).toContain("class: 'sponsorship-menu-text'")
    expect(source).toContain("'aria-hidden': 'true'")
    expect(source).toContain('justify-content: flex-start')
    expect(source).toContain('gap: 8px')
    expect(source).toContain('white-space: nowrap')
    expect(source).toContain('transform: translateX(-1px) scale(1.08)')
    expect(source).toContain('transform: scaleX(1)')
    expect(source).not.toContain("icon: () => h(NIcon, { size: 17, class: 'sponsorship-menu-heart' }")
    expect(source).toContain("target: '_blank'")
    expect(source).toContain("rel: 'noopener noreferrer'")
  })
})
