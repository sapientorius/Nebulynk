import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path) {
  return readFileSync(resolve(path), 'utf8')
}

describe('system information administration UI', () => {
  it('shows the four storage cards, localized sizes, and stale-state refresh affordance', () => {
    const component = source('src/components/admin/SystemInfo.vue')

    expect(component).toContain('data-testid="system-info-panel"')
    expect(component).toContain('data-testid="system-info-storage-usage"')
    expect(component).toContain('data-testid="storage-usage-total"')
    expect(component).toContain('data-testid="storage-usage-database"')
    expect(component).toContain('data-testid="storage-usage-files"')
    expect(component).toContain('data-testid="storage-usage-recordings"')
    expect(component).toContain('status?.total_bytes')
    expect(component).toContain('status?.database?.bytes')
    expect(component).toContain('status?.object_storage?.files?.bytes')
    expect(component).toContain('status?.object_storage?.meeting_recordings?.bytes')
    expect(component).toContain('object_count')
    expect(component).toContain("import { formatStorageBytes } from '../../lib/storage-usage.js'")
    expect(component).toContain('return formatStorageBytes(value, this.locale)')
    expect(component).toContain('STALE_AFTER_SECONDS = 10 * 60')
    expect(component).toContain('data-testid="system-info-stale-warning"')
    expect(component).toContain('data-testid="system-info-refresh"')
    expect(component).toContain(':disabled="systemInfoStore.loading || systemInfoStore.refreshing"')
    expect(component).toContain('@click="refresh"')
    expect(component).toContain('window.setInterval')
    expect(component).toContain('systemInfoStore.error && !status')
  })

  it('keeps System Info private to platform admins and places it directly before Updates', () => {
    const adminView = source('src/views/AdminView.vue')
    const systemInfoIndex = adminView.indexOf("label: this.$t('systemInfo.menu'), key: 'system-info'")
    const updatesIndex = adminView.indexOf('const count = this.updatesStore.unacknowledgedCount')

    expect(adminView).toContain("SystemInfo v-if=\"activeTab === 'system-info'\"")
    expect(adminView).toContain("const SystemInfo = defineAsyncComponent(() => import('../components/admin/SystemInfo.vue'))")
    expect(systemInfoIndex).toBeGreaterThan(adminView.indexOf('if (this.sessionStore.user?.is_admin === true) {'))
    expect(systemInfoIndex).toBeLessThan(updatesIndex)
  })

  it('uses the private storage endpoints and declares both language variants', () => {
    const api = source('src/lib/api.js')
    const i18n = source('src/lib/i18n.js')

    expect(api).toContain("api.get('/system-info/storage-usage')")
    expect(api).toContain("api.post('/system-info/storage-usage/refresh', {})")
    expect(api).not.toContain("getPlatformStatus('/system-info")
    expect(i18n).toContain("storageUsage: 'Storage usage'")
    expect(i18n).toContain("storageUsage: 'Speichernutzung'")
  })
})
