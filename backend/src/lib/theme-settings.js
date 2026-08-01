export const THEME_MODE_VALUES = ['dark', 'light', 'system']
export const USER_THEME_PREFERENCE_VALUES = ['platform', 'light', 'dark', 'system']
export const THEME_FONT_FAMILY_VALUES = ['lato', 'roboto', 'inter', 'open-sans', 'fira-sans', 'ibm-plex-sans', 'system']

export const DEFAULT_THEME_SETTINGS = {
  modeDefault: 'dark',
  darkPrimaryColor: '#63e2b7',
  darkSecondaryColor: '#5c75ff',
  darkSuccessColor: '#63e2b7',
  darkWarningColor: '#faad14',
  darkErrorColor: '#ff4d4f',
  lightPrimaryColor: '#63e2b7',
  lightSecondaryColor: '#5c75ff',
  lightSuccessColor: '#63e2b7',
  lightWarningColor: '#faad14',
  lightErrorColor: '#ff4d4f',
  fontFamily: 'lato',
  customCssGlobal: '',
  darkCustomCss: '',
  lightCustomCss: ''
}

export const THEME_SETTING_KEYS = {
  modeDefault: 'theme_mode_default',
  primaryColor: 'theme_primary_color',
  secondaryColor: 'theme_secondary_color',
  successColor: 'theme_success_color',
  warningColor: 'theme_warning_color',
  errorColor: 'theme_error_color',
  darkPrimaryColor: 'theme_dark_primary_color',
  darkSecondaryColor: 'theme_dark_secondary_color',
  darkSuccessColor: 'theme_dark_success_color',
  darkWarningColor: 'theme_dark_warning_color',
  darkErrorColor: 'theme_dark_error_color',
  lightPrimaryColor: 'theme_light_primary_color',
  lightSecondaryColor: 'theme_light_secondary_color',
  lightSuccessColor: 'theme_light_success_color',
  lightWarningColor: 'theme_light_warning_color',
  lightErrorColor: 'theme_light_error_color',
  fontFamily: 'theme_font_family',
  customCssGlobal: 'theme_custom_css_global',
  darkCustomCss: 'theme_dark_custom_css',
  lightCustomCss: 'theme_light_custom_css'
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
export const THEME_CUSTOM_CSS_MAX_LENGTH = 20000

export function normalizeThemeMode(value, fallback = DEFAULT_THEME_SETTINGS.modeDefault) {
  return THEME_MODE_VALUES.includes(value) ? value : fallback
}

export function normalizeUserThemePreference(value, fallback = 'platform') {
  return USER_THEME_PREFERENCE_VALUES.includes(value) ? value : fallback
}

export function normalizeThemeFontFamily(value, fallback = DEFAULT_THEME_SETTINGS.fontFamily) {
  return THEME_FONT_FAMILY_VALUES.includes(value) ? value : fallback
}

export function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!HEX_COLOR_PATTERN.test(trimmed)) return fallback
  return trimmed.toLowerCase()
}

export function normalizeCustomCss(value, fallback = '') {
  if (typeof value !== 'string') return fallback
  return value.slice(0, THEME_CUSTOM_CSS_MAX_LENGTH)
}

export function normalizeThemeSettingsMap(settings = {}) {
  const legacyPrimary = normalizeHexColor(settings[THEME_SETTING_KEYS.primaryColor], DEFAULT_THEME_SETTINGS.darkPrimaryColor)
  const legacySecondary = normalizeHexColor(settings[THEME_SETTING_KEYS.secondaryColor], DEFAULT_THEME_SETTINGS.darkSecondaryColor)
  const legacySuccess = normalizeHexColor(settings[THEME_SETTING_KEYS.successColor], DEFAULT_THEME_SETTINGS.darkSuccessColor)
  const legacyWarning = normalizeHexColor(settings[THEME_SETTING_KEYS.warningColor], DEFAULT_THEME_SETTINGS.darkWarningColor)
  const legacyError = normalizeHexColor(settings[THEME_SETTING_KEYS.errorColor], DEFAULT_THEME_SETTINGS.darkErrorColor)
  const darkPrimaryColor = normalizeHexColor(settings[THEME_SETTING_KEYS.darkPrimaryColor], legacyPrimary)
  const darkSecondaryColor = normalizeHexColor(settings[THEME_SETTING_KEYS.darkSecondaryColor], legacySecondary)
  const darkSuccessColor = normalizeHexColor(settings[THEME_SETTING_KEYS.darkSuccessColor], legacySuccess)
  const darkWarningColor = normalizeHexColor(settings[THEME_SETTING_KEYS.darkWarningColor], legacyWarning)
  const darkErrorColor = normalizeHexColor(settings[THEME_SETTING_KEYS.darkErrorColor], legacyError)
  const lightPrimaryColor = normalizeHexColor(settings[THEME_SETTING_KEYS.lightPrimaryColor], legacyPrimary)
  const lightSecondaryColor = normalizeHexColor(settings[THEME_SETTING_KEYS.lightSecondaryColor], legacySecondary)
  const lightSuccessColor = normalizeHexColor(settings[THEME_SETTING_KEYS.lightSuccessColor], legacySuccess)
  const lightWarningColor = normalizeHexColor(settings[THEME_SETTING_KEYS.lightWarningColor], legacyWarning)
  const lightErrorColor = normalizeHexColor(settings[THEME_SETTING_KEYS.lightErrorColor], legacyError)

  return {
    [THEME_SETTING_KEYS.modeDefault]: normalizeThemeMode(
      settings[THEME_SETTING_KEYS.modeDefault],
      DEFAULT_THEME_SETTINGS.modeDefault
    ),
    [THEME_SETTING_KEYS.primaryColor]: darkPrimaryColor,
    [THEME_SETTING_KEYS.secondaryColor]: darkSecondaryColor,
    [THEME_SETTING_KEYS.successColor]: darkSuccessColor,
    [THEME_SETTING_KEYS.warningColor]: darkWarningColor,
    [THEME_SETTING_KEYS.errorColor]: darkErrorColor,
    [THEME_SETTING_KEYS.darkPrimaryColor]: darkPrimaryColor,
    [THEME_SETTING_KEYS.darkSecondaryColor]: darkSecondaryColor,
    [THEME_SETTING_KEYS.darkSuccessColor]: darkSuccessColor,
    [THEME_SETTING_KEYS.darkWarningColor]: darkWarningColor,
    [THEME_SETTING_KEYS.darkErrorColor]: darkErrorColor,
    [THEME_SETTING_KEYS.lightPrimaryColor]: lightPrimaryColor,
    [THEME_SETTING_KEYS.lightSecondaryColor]: lightSecondaryColor,
    [THEME_SETTING_KEYS.lightSuccessColor]: lightSuccessColor,
    [THEME_SETTING_KEYS.lightWarningColor]: lightWarningColor,
    [THEME_SETTING_KEYS.lightErrorColor]: lightErrorColor,
    [THEME_SETTING_KEYS.fontFamily]: normalizeThemeFontFamily(settings[THEME_SETTING_KEYS.fontFamily]),
    [THEME_SETTING_KEYS.customCssGlobal]: normalizeCustomCss(settings[THEME_SETTING_KEYS.customCssGlobal]),
    [THEME_SETTING_KEYS.darkCustomCss]: normalizeCustomCss(settings[THEME_SETTING_KEYS.darkCustomCss]),
    [THEME_SETTING_KEYS.lightCustomCss]: normalizeCustomCss(settings[THEME_SETTING_KEYS.lightCustomCss])
  }
}

export function normalizeThemeSettingsPatch(data = {}) {
  const patch = {}
  if (Object.prototype.hasOwnProperty.call(data, 'themeModeDefault')) {
    patch.themeModeDefault = normalizeThemeMode(data.themeModeDefault, DEFAULT_THEME_SETTINGS.modeDefault)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themePrimaryColor')) {
    patch.themePrimaryColor = normalizeHexColor(data.themePrimaryColor, DEFAULT_THEME_SETTINGS.darkPrimaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeSecondaryColor')) {
    patch.themeSecondaryColor = normalizeHexColor(data.themeSecondaryColor, DEFAULT_THEME_SETTINGS.darkSecondaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeSuccessColor')) {
    patch.themeSuccessColor = normalizeHexColor(data.themeSuccessColor, DEFAULT_THEME_SETTINGS.darkSuccessColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeWarningColor')) {
    patch.themeWarningColor = normalizeHexColor(data.themeWarningColor, DEFAULT_THEME_SETTINGS.darkWarningColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeErrorColor')) {
    patch.themeErrorColor = normalizeHexColor(data.themeErrorColor, DEFAULT_THEME_SETTINGS.darkErrorColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkPrimaryColor')) {
    patch.themeDarkPrimaryColor = normalizeHexColor(data.themeDarkPrimaryColor, DEFAULT_THEME_SETTINGS.darkPrimaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkSecondaryColor')) {
    patch.themeDarkSecondaryColor = normalizeHexColor(data.themeDarkSecondaryColor, DEFAULT_THEME_SETTINGS.darkSecondaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkSuccessColor')) {
    patch.themeDarkSuccessColor = normalizeHexColor(data.themeDarkSuccessColor, DEFAULT_THEME_SETTINGS.darkSuccessColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkWarningColor')) {
    patch.themeDarkWarningColor = normalizeHexColor(data.themeDarkWarningColor, DEFAULT_THEME_SETTINGS.darkWarningColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkErrorColor')) {
    patch.themeDarkErrorColor = normalizeHexColor(data.themeDarkErrorColor, DEFAULT_THEME_SETTINGS.darkErrorColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightPrimaryColor')) {
    patch.themeLightPrimaryColor = normalizeHexColor(data.themeLightPrimaryColor, DEFAULT_THEME_SETTINGS.lightPrimaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightSecondaryColor')) {
    patch.themeLightSecondaryColor = normalizeHexColor(data.themeLightSecondaryColor, DEFAULT_THEME_SETTINGS.lightSecondaryColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightSuccessColor')) {
    patch.themeLightSuccessColor = normalizeHexColor(data.themeLightSuccessColor, DEFAULT_THEME_SETTINGS.lightSuccessColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightWarningColor')) {
    patch.themeLightWarningColor = normalizeHexColor(data.themeLightWarningColor, DEFAULT_THEME_SETTINGS.lightWarningColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightErrorColor')) {
    patch.themeLightErrorColor = normalizeHexColor(data.themeLightErrorColor, DEFAULT_THEME_SETTINGS.lightErrorColor)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeFontFamily')) {
    patch.themeFontFamily = normalizeThemeFontFamily(data.themeFontFamily)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeCustomCssGlobal')) {
    patch.themeCustomCssGlobal = normalizeCustomCss(data.themeCustomCssGlobal)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeDarkCustomCss')) {
    patch.themeDarkCustomCss = normalizeCustomCss(data.themeDarkCustomCss)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'themeLightCustomCss')) {
    patch.themeLightCustomCss = normalizeCustomCss(data.themeLightCustomCss)
  }
  return patch
}
