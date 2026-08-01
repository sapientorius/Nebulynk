import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('settings return origin source contract', () => {
  it('opens settings with a safe returnTo query from the current route', () => {
    const source = readFileSync(resolve('src/components/UserAccountMenu.vue'), 'utf8')

    expect(source).toContain('getSettingsReturnTo()')
    expect(source).toContain("const fullPath = this.$route?.fullPath")
    expect(source).toContain("fullPath.startsWith('/settings')")
    expect(source).toContain("fullPath.startsWith('/channels')")
    expect(source).toContain("fullPath.startsWith('/meetings')")
    expect(source).toContain("fullPath.startsWith('/admin')")
    expect(source).toContain("const location = returnTo ? { path: '/settings', query: { returnTo } } : '/settings'")
    expect(source).toContain('this.$router.push(location).catch(() => {})')
  })

  it('routes the settings back button through validated chat or meeting targets', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain('@click="goBackToChat"')
    expect(source).not.toContain('@click="$router.push(\'/channels\')"')
    expect(source).toContain('resolveReturnToChatRoute()')
    expect(source).toContain('const returnTo = this.$route?.query?.returnTo')
    expect(source).toContain("if (typeof returnTo !== 'string') return '/channels'")
    expect(source).toContain("returnTo.startsWith('/channels') || returnTo.startsWith('/meetings')")
    expect(source).toContain('this.$router.push(this.resolveReturnToChatRoute()).catch(() => {})')
  })
})
