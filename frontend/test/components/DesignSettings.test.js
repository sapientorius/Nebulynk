import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('DesignSettings source contract', () => {
  it('exposes dedicated per-theme design controls and local reset actions', () => {
    const source = readFileSync(resolve('src/components/admin/DesignSettings.vue'), 'utf8')

    expect(source).toContain('data-testid="design-settings-panel"')
    expect(source).toContain('data-testid="platform-theme-mode-default"')
    expect(source).toContain('data-testid="platform-theme-font-family"')
    expect(source).toContain('data-testid="design-theme-mode-toggle"')
    expect(source).toContain('data-testid="platform-theme-dark-primary-color"')
    expect(source).toContain('data-testid="platform-theme-light-primary-color"')
    expect(source).toContain('data-testid="design-global-custom-css"')
    expect(source).toContain('data-testid="design-theme-custom-css"')
    expect(source).toContain('data-testid="design-theme-reset-current"')
    expect(source).toContain('data-testid="design-theme-reset-all"')
    expect(source).toContain('data-testid="design-css-reset"')
    expect(source).toContain('themeDarkPrimaryColor: DEFAULT_THEME_SETTINGS.theme_dark_primary_color')
    expect(source).toContain('themeFontFamily: DEFAULT_THEME_SETTINGS.theme_font_family')
    expect(source).toContain('themeLightPrimaryColor: DEFAULT_THEME_SETTINGS.theme_light_primary_color')
    expect(source).toContain('themeCustomCssGlobal: DEFAULT_THEME_SETTINGS.theme_custom_css_global')
    expect(source).toContain('themeDarkCustomCss: DEFAULT_THEME_SETTINGS.theme_dark_custom_css')
    expect(source).toContain('themeLightCustomCss: DEFAULT_THEME_SETTINGS.theme_light_custom_css')
    expect(source).toContain('themeDarkPrimaryColor: normalizeHexColor(this.themeDarkPrimaryColor')
    expect(source).toContain('themeFontFamily: normalizeFontFamily(this.themeFontFamily')
    expect(source).toContain('themeLightPrimaryColor: normalizeHexColor(this.themeLightPrimaryColor')
    expect(source).toContain('themeCustomCssGlobal: normalizeCustomCss(this.themeCustomCssGlobal)')
    expect(source).toContain('this.themeStore.setPlatformThemeSettings(settings)')
    expect(source).toContain('resetActiveThemeColors()')
    expect(source).toContain('resetAllThemeColors()')
    expect(source).toContain('resetCss()')
  })
})
