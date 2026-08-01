import {
  DEFAULT_FONT_FAMILY,
  getFontFaceCss,
  getFontFamilyStack,
  normalizeFontFamily
} from './font-settings.js'

export { normalizeFontFamily } from './font-settings.js'

export const THEME_MODE_OPTIONS = ['dark', 'light', 'system']
export const USER_THEME_PREFERENCE_OPTIONS = ['platform', 'light', 'dark', 'system']

export const DEFAULT_THEME_SETTINGS = {
  theme_mode_default: 'dark',
  theme_primary_color: '#63e2b7',
  theme_secondary_color: '#5c75ff',
  theme_success_color: '#63e2b7',
  theme_warning_color: '#faad14',
  theme_error_color: '#ff4d4f',
  theme_dark_primary_color: '#63e2b7',
  theme_dark_secondary_color: '#5c75ff',
  theme_dark_success_color: '#63e2b7',
  theme_dark_warning_color: '#faad14',
  theme_dark_error_color: '#ff4d4f',
  theme_light_primary_color: '#63e2b7',
  theme_light_secondary_color: '#5c75ff',
  theme_light_success_color: '#63e2b7',
  theme_light_warning_color: '#faad14',
  theme_light_error_color: '#ff4d4f',
  theme_font_family: DEFAULT_FONT_FAMILY,
  theme_custom_css_global: '',
  theme_dark_custom_css: '',
  theme_light_custom_css: ''
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function normalizeThemeMode(value, fallback = DEFAULT_THEME_SETTINGS.theme_mode_default) {
  return THEME_MODE_OPTIONS.includes(value) ? value : fallback
}

export function normalizeUserThemePreference(value, fallback = 'platform') {
  return USER_THEME_PREFERENCE_OPTIONS.includes(value) ? value : fallback
}

export function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!HEX_COLOR_PATTERN.test(trimmed)) return fallback
  return trimmed.toLowerCase()
}

export function normalizeCustomCss(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function normalizePlatformThemeSettings(settings = {}) {
  const legacyPrimaryColor = normalizeHexColor(settings.theme_primary_color, DEFAULT_THEME_SETTINGS.theme_primary_color)
  const legacySecondaryColor = normalizeHexColor(settings.theme_secondary_color, DEFAULT_THEME_SETTINGS.theme_secondary_color)
  const legacySuccessColor = normalizeHexColor(settings.theme_success_color, DEFAULT_THEME_SETTINGS.theme_success_color)
  const legacyWarningColor = normalizeHexColor(settings.theme_warning_color, DEFAULT_THEME_SETTINGS.theme_warning_color)
  const legacyErrorColor = normalizeHexColor(settings.theme_error_color, DEFAULT_THEME_SETTINGS.theme_error_color)
  const darkPrimaryColor = normalizeHexColor(settings.theme_dark_primary_color, legacyPrimaryColor)
  const darkSecondaryColor = normalizeHexColor(settings.theme_dark_secondary_color, legacySecondaryColor)
  const darkSuccessColor = normalizeHexColor(settings.theme_dark_success_color, legacySuccessColor)
  const darkWarningColor = normalizeHexColor(settings.theme_dark_warning_color, legacyWarningColor)
  const darkErrorColor = normalizeHexColor(settings.theme_dark_error_color, legacyErrorColor)
  const lightPrimaryColor = normalizeHexColor(settings.theme_light_primary_color, legacyPrimaryColor)
  const lightSecondaryColor = normalizeHexColor(settings.theme_light_secondary_color, legacySecondaryColor)
  const lightSuccessColor = normalizeHexColor(settings.theme_light_success_color, legacySuccessColor)
  const lightWarningColor = normalizeHexColor(settings.theme_light_warning_color, legacyWarningColor)
  const lightErrorColor = normalizeHexColor(settings.theme_light_error_color, legacyErrorColor)

  return {
    theme_mode_default: normalizeThemeMode(settings.theme_mode_default),
    theme_primary_color: darkPrimaryColor,
    theme_secondary_color: darkSecondaryColor,
    theme_success_color: darkSuccessColor,
    theme_warning_color: darkWarningColor,
    theme_error_color: darkErrorColor,
    theme_dark_primary_color: darkPrimaryColor,
    theme_dark_secondary_color: darkSecondaryColor,
    theme_dark_success_color: darkSuccessColor,
    theme_dark_warning_color: darkWarningColor,
    theme_dark_error_color: darkErrorColor,
    theme_light_primary_color: lightPrimaryColor,
    theme_light_secondary_color: lightSecondaryColor,
    theme_light_success_color: lightSuccessColor,
    theme_light_warning_color: lightWarningColor,
    theme_light_error_color: lightErrorColor,
    theme_font_family: normalizeFontFamily(settings.theme_font_family),
    theme_custom_css_global: normalizeCustomCss(settings.theme_custom_css_global),
    theme_dark_custom_css: normalizeCustomCss(settings.theme_dark_custom_css),
    theme_light_custom_css: normalizeCustomCss(settings.theme_light_custom_css)
  }
}

export function resolveEffectiveThemeMode({
  platformMode = DEFAULT_THEME_SETTINGS.theme_mode_default,
  userPreference = 'platform',
  systemMode = 'dark'
} = {}) {
  const normalizedUserPreference = normalizeUserThemePreference(userPreference)
  const normalizedPlatformMode = normalizeThemeMode(platformMode)
  const normalizedSystemMode = systemMode === 'light' ? 'light' : 'dark'

  if (normalizedUserPreference === 'light' || normalizedUserPreference === 'dark') {
    return normalizedUserPreference
  }

  const requestedMode = normalizedUserPreference === 'system'
    ? 'system'
    : normalizedPlatformMode

  return requestedMode === 'system' ? normalizedSystemMode : requestedMode
}

function hexToRgbParts(hexColor) {
  const normalized = normalizeHexColor(hexColor, '#000000').slice(1)
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}

function mixChannel(channel, target, ratio) {
  return Math.round(channel + (target - channel) * ratio)
}

export function mixHexColor(hexColor, targetHexColor, ratio) {
  const source = hexToRgbParts(hexColor)
  const target = hexToRgbParts(targetHexColor)
  const mixed = source.map((channel, index) => mixChannel(channel, target[index], ratio))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgbTriplet(hexColor) {
  return hexToRgbParts(hexColor).join(', ')
}

export function getThemeColorSettings(settings = {}, mode = 'dark') {
  const theme = normalizePlatformThemeSettings(settings)
  const prefix = mode === 'light' ? 'theme_light' : 'theme_dark'
  return {
    primaryColor: theme[`${prefix}_primary_color`],
    secondaryColor: theme[`${prefix}_secondary_color`],
    successColor: theme[`${prefix}_success_color`],
    warningColor: theme[`${prefix}_warning_color`],
    errorColor: theme[`${prefix}_error_color`]
  }
}

export function getThemeCustomCss(settings = {}, mode = 'dark') {
  const theme = normalizePlatformThemeSettings(settings)
  return {
    globalCss: theme.theme_custom_css_global,
    themeCss: mode === 'light' ? theme.theme_light_custom_css : theme.theme_dark_custom_css
  }
}

export function getThemeFontFaceCss(settings = {}) {
  const theme = normalizePlatformThemeSettings(settings)
  return getFontFaceCss(theme.theme_font_family)
}

export function buildNaiveThemeOverrides(settings = {}, mode = 'dark') {
  const theme = getThemeColorSettings(settings, mode)
  const normalizedSettings = normalizePlatformThemeSettings(settings)
  return {
    common: {
      fontFamily: getFontFamilyStack(normalizedSettings.theme_font_family),
      primaryColor: theme.primaryColor,
      primaryColorHover: mixHexColor(theme.primaryColor, '#ffffff', 0.16),
      primaryColorPressed: mixHexColor(theme.primaryColor, '#000000', 0.14),
      primaryColorSuppl: mixHexColor(theme.primaryColor, '#ffffff', 0.22),
      infoColor: theme.secondaryColor,
      infoColorHover: mixHexColor(theme.secondaryColor, '#ffffff', 0.16),
      infoColorPressed: mixHexColor(theme.secondaryColor, '#000000', 0.14),
      successColor: theme.successColor,
      successColorHover: mixHexColor(theme.successColor, '#ffffff', 0.16),
      successColorPressed: mixHexColor(theme.successColor, '#000000', 0.14),
      warningColor: theme.warningColor,
      warningColorHover: mixHexColor(theme.warningColor, '#ffffff', 0.16),
      warningColorPressed: mixHexColor(theme.warningColor, '#000000', 0.14),
      errorColor: theme.errorColor,
      errorColorHover: mixHexColor(theme.errorColor, '#ffffff', 0.16),
      errorColorPressed: mixHexColor(theme.errorColor, '#000000', 0.14)
    }
  }
}

export function buildThemeCssVariables(settings = {}, mode = 'dark') {
  const theme = getThemeColorSettings(settings, mode)
  const normalizedSettings = normalizePlatformThemeSettings(settings)
  const light = mode === 'light'
  const surfaceRgb = light ? '255, 255, 255' : '255, 255, 255'
  const textRgb = light ? '17, 24, 39' : '255, 255, 255'

  return {
    '--theme-primary': theme.primaryColor,
    '--theme-primary-hover': mixHexColor(theme.primaryColor, light ? '#000000' : '#ffffff', light ? 0.08 : 0.16),
    '--theme-secondary': theme.secondaryColor,
    '--theme-success': theme.successColor,
    '--theme-warning': theme.warningColor,
    '--theme-error': theme.errorColor,
    '--app-font-family': getFontFamilyStack(normalizedSettings.theme_font_family),
    '--theme-primary-rgb': hexToRgbTriplet(theme.primaryColor),
    '--theme-secondary-rgb': hexToRgbTriplet(theme.secondaryColor),
    '--theme-success-rgb': hexToRgbTriplet(theme.successColor),
    '--theme-warning-rgb': hexToRgbTriplet(theme.warningColor),
    '--theme-error-rgb': hexToRgbTriplet(theme.errorColor),
    '--app-bg': light ? '#f5f7fb' : '#18181c',
    '--app-bg-strong': light ? '#eef2f7' : '#080a10',
    '--app-surface': light ? 'rgba(255, 255, 255, 0.86)' : 'rgba(255, 255, 255, 0.02)',
    '--app-surface-raised': light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(34, 34, 39, 0.94)',
    '--app-surface-muted': light ? 'rgba(15, 23, 42, 0.045)' : 'rgba(255, 255, 255, 0.06)',
    '--app-hover': light ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.1)',
    '--app-border': light ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.09)',
    '--app-border-soft': light ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.06)',
    '--app-border-strong': light ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.12)',
    '--app-text': light ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.82)',
    '--app-text-strong': light ? 'rgba(17, 24, 39, 0.96)' : 'rgba(255, 255, 255, 0.95)',
    '--app-text-muted': light ? 'rgba(17, 24, 39, 0.62)' : 'rgba(255, 255, 255, 0.62)',
    '--app-avatar-bg': light ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)',
    '--app-avatar-text': light ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
    '--app-avatar-border': light ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.14)',
    '--app-overlay': light ? 'rgba(255, 255, 255, 0.92)' : 'rgba(28, 28, 36, 0.95)',
    '--app-shadow': light ? 'rgba(15, 23, 42, 0.18)' : 'rgba(0, 0, 0, 0.35)',
    '--app-focus': `rgba(${hexToRgbTriplet(theme.primaryColor)}, 0.58)`,
    '--app-drop-bg': `rgba(${hexToRgbTriplet(theme.primaryColor)}, ${light ? '0.12' : '0.08'})`,
    '--app-drop-border': `rgba(${hexToRgbTriplet(theme.primaryColor)}, 0.5)`,
    '--app-primary-soft': `rgba(${hexToRgbTriplet(theme.primaryColor)}, ${light ? '0.12' : '0.08'})`,
    '--app-primary-softer': `rgba(${hexToRgbTriplet(theme.primaryColor)}, ${light ? '0.07' : '0.04'})`,
    '--app-secondary-soft': `rgba(${hexToRgbTriplet(theme.secondaryColor)}, ${light ? '0.12' : '0.08'})`,
    '--app-rgb-surface': surfaceRgb,
    '--app-rgb-text': textRgb,
    '--scrollbar-track': light ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.045)',
    '--scrollbar-thumb': light ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.16)',
    '--scrollbar-thumb-hover': light ? 'rgba(15, 23, 42, 0.32)' : 'rgba(255, 255, 255, 0.26)',
    '--scrollbar-thumb-active': `rgba(${hexToRgbTriplet(theme.primaryColor)}, 0.36)`
  }
}
