import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('SettingsView theme preference source contract', () => {
  it('exposes theme preference in the general settings form', () => {
    const source = readFileSync(resolve('src/views/SettingsView.vue'), 'utf8')

    expect(source).toContain('data-testid="settings-theme-select"')
    expect(source).toContain("themePreference: 'platform'")
    expect(source).toContain('themePreferenceOptions()')
    expect(source).toContain('saveGeneralPreferences(this.sessionStore')
    expect(source).toContain('themePreference: this.generalForm.themePreference')
  })
})
