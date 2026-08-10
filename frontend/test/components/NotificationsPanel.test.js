import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('NotificationsPanel notification delivery controls', () => {
  it('uses the shared notification toggle for browser and desktop runtimes', () => {
    const source = readFileSync(resolve('src/components/NotificationsPanel.vue'), 'utf8')

    expect(source).toContain('notificationsStore.canToggleNotifications')
    expect(source).toContain('await this.notificationsStore.enableNotifications()')
    expect(source).toContain('await this.notificationsStore.disableNotifications()')
    expect(source).toContain("'Desktop notifications'")
    expect(source).not.toContain("if (!this.isDesktopMode)")
  })

  it('opens message notifications directly on their source message query', () => {
    const source = readFileSync(resolve('src/components/NotificationsPanel.vue'), 'utf8')

    expect(source).toContain("path: `/channels/${notif.channel_id}`")
    expect(source).toContain("query: notif.message_id ? { message: notif.message_id } : {}")
  })

  it('opens registration notifications in the registration settings tab', () => {
    const source = readFileSync(resolve('src/components/NotificationsPanel.vue'), 'utf8')

    expect(source).toContain("notif?.type === 'registration_pending'")
    expect(source).toContain("query: { tab: 'registration' }")
    expect(source).toContain("this.$t('selfRegistrationAdmin.title')")
  })
})
