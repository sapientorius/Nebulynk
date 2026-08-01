import { describe, expect, it } from 'vitest'
import {
  buildNaiveThemeOverrides,
  buildThemeCssVariables,
  getThemeFontFaceCss,
  getThemeCustomCss,
  normalizeHexColor,
  normalizeFontFamily,
  normalizePlatformThemeSettings,
  resolveEffectiveThemeMode
} from '../../src/lib/theme-settings.js'

describe('theme settings helpers', () => {
  it('resolves user, platform, and system theme precedence', () => {
    expect(resolveEffectiveThemeMode({
      platformMode: 'dark',
      userPreference: 'light',
      systemMode: 'dark'
    })).toBe('light')

    expect(resolveEffectiveThemeMode({
      platformMode: 'system',
      userPreference: 'platform',
      systemMode: 'light'
    })).toBe('light')

    expect(resolveEffectiveThemeMode({
      platformMode: 'light',
      userPreference: 'system',
      systemMode: 'dark'
    })).toBe('dark')
  })

  it('normalizes platform colors and builds Naive UI overrides', () => {
    const settings = normalizePlatformThemeSettings({
      theme_mode_default: 'light',
      theme_dark_primary_color: '#AABBCC',
      theme_dark_secondary_color: '#112233',
      theme_dark_success_color: '#118855',
      theme_dark_warning_color: '#CC9900',
      theme_dark_error_color: '#CC3344',
      theme_light_primary_color: '#DDEEFF',
      theme_light_secondary_color: '#223344',
      theme_light_success_color: '#118855',
      theme_font_family: 'roboto',
      theme_custom_css_global: ':root { --x: 1; }',
      theme_light_custom_css: 'body { color: black; }'
    })

    expect(settings.theme_primary_color).toBe('#aabbcc')
    expect(settings.theme_dark_primary_color).toBe('#aabbcc')
    expect(settings.theme_light_primary_color).toBe('#ddeeff')
    expect(settings.theme_font_family).toBe('roboto')
    expect(normalizeHexColor('bad', '#123456')).toBe('#123456')
    expect(normalizeFontFamily('bad')).toBe('lato')

    const overrides = buildNaiveThemeOverrides(settings, 'light')
    expect(overrides.common.primaryColor).toBe('#ddeeff')
    expect(overrides.common.infoColor).toBe('#223344')
    expect(overrides.common.successColor).toBe('#118855')
    expect(overrides.common.fontFamily).toContain('Nebulynk Roboto')

    expect(getThemeCustomCss(settings, 'light')).toEqual({
      globalCss: ':root { --x: 1; }',
      themeCss: 'body { color: black; }'
    })
  })

  it('builds light-mode CSS variables for custom surfaces', () => {
    const variables = buildThemeCssVariables({
      theme_light_primary_color: '#112233',
      theme_font_family: 'inter'
    }, 'light')

    expect(variables['--theme-primary']).toBe('#112233')
    expect(variables['--theme-primary-rgb']).toBe('17, 34, 51')
    expect(variables['--app-bg']).toBe('#f5f7fb')
    expect(variables['--app-avatar-bg']).toBe('rgba(15, 23, 42, 0.14)')
    expect(variables['--app-avatar-text']).toBe('rgba(15, 23, 42, 0.88)')
    expect(variables['--app-avatar-border']).toBe('rgba(15, 23, 42, 0.16)')
    expect(variables['--app-font-family']).toContain('Nebulynk Inter')
  })

  it('keeps fallback avatar colors mode-aware', () => {
    const lightVariables = buildThemeCssVariables({}, 'light')
    const darkVariables = buildThemeCssVariables({}, 'dark')

    expect(lightVariables['--app-avatar-bg']).not.toBe(darkVariables['--app-avatar-bg'])
    expect(lightVariables['--app-avatar-text']).not.toBe(darkVariables['--app-avatar-text'])
    expect(lightVariables['--app-avatar-border']).not.toBe(darkVariables['--app-avatar-border'])
    expect(darkVariables['--app-avatar-bg']).toBe('rgba(255, 255, 255, 0.14)')
    expect(darkVariables['--app-avatar-text']).toBe('rgba(255, 255, 255, 0.92)')
    expect(darkVariables['--app-avatar-border']).toBe('rgba(255, 255, 255, 0.14)')
  })

  it('builds self-hosted font-face CSS for the selected platform font', () => {
    const css = getThemeFontFaceCss({ theme_font_family: 'lato' })

    expect(css).toContain('@font-face')
    expect(css).toContain('font-family: "Nebulynk Lato"')
    expect(css).toContain('font-display: swap')
    expect(css).not.toContain('fonts.googleapis.com')
    expect(getThemeFontFaceCss({ theme_font_family: 'system' })).toBe('')
  })

  it('falls back from new theme keys to legacy color settings', () => {
    const settings = normalizePlatformThemeSettings({
      theme_primary_color: '#112233',
      theme_secondary_color: '#445566'
    })

    expect(settings.theme_dark_primary_color).toBe('#112233')
    expect(settings.theme_light_primary_color).toBe('#112233')
    expect(settings.theme_font_family).toBe('lato')
    expect(buildThemeCssVariables(settings, 'dark')['--theme-secondary']).toBe('#445566')
  })
})
