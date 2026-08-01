import latoRegularUrl from 'vfonts/assets/LatoLatin-Regular.woff2?url'
import latoSemiBoldUrl from 'vfonts/assets/LatoLatin-Semibold.woff2?url'
import robotoRegularUrl from 'vfonts/assets/Roboto-Regular.ttf?url'
import robotoMediumUrl from 'vfonts/assets/Roboto-Medium.ttf?url'
import interRegularUrl from 'vfonts/assets/Inter-Regular.woff2?url'
import interMediumUrl from 'vfonts/assets/Inter-Medium.woff2?url'
import openSansRegularUrl from 'vfonts/assets/OpenSans-Regular.ttf?url'
import openSansSemiBoldUrl from 'vfonts/assets/OpenSans-SemiBold.ttf?url'
import firaSansRegularUrl from 'vfonts/assets/FiraSans-Regular.woff2?url'
import firaSansMediumUrl from 'vfonts/assets/FiraSans-Medium.woff2?url'
import ibmPlexSansRegularUrl from 'vfonts/assets/IBMPlexSans-Regular.ttf?url'
import ibmPlexSansMediumUrl from 'vfonts/assets/IBMPlexSans-Medium.ttf?url'

export const DEFAULT_FONT_FAMILY = 'lato'
export const FONT_FAMILY_OPTIONS = ['lato', 'roboto', 'inter', 'open-sans', 'fira-sans', 'ibm-plex-sans', 'system']

const SYSTEM_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"'

const FONT_DEFINITIONS = {
  lato: {
    label: 'Lato',
    family: 'Nebulynk Lato',
    files: [
      { url: latoRegularUrl, weight: 400, format: 'woff2' },
      { url: latoSemiBoldUrl, weight: 600, format: 'woff2' }
    ]
  },
  roboto: {
    label: 'Roboto',
    family: 'Nebulynk Roboto',
    files: [
      { url: robotoRegularUrl, weight: 400, format: 'truetype' },
      { url: robotoMediumUrl, weight: 500, format: 'truetype' }
    ]
  },
  inter: {
    label: 'Inter',
    family: 'Nebulynk Inter',
    files: [
      { url: interRegularUrl, weight: 400, format: 'woff2' },
      { url: interMediumUrl, weight: 500, format: 'woff2' }
    ]
  },
  'open-sans': {
    label: 'Open Sans',
    family: 'Nebulynk Open Sans',
    files: [
      { url: openSansRegularUrl, weight: 400, format: 'truetype' },
      { url: openSansSemiBoldUrl, weight: 600, format: 'truetype' }
    ]
  },
  'fira-sans': {
    label: 'Fira Sans',
    family: 'Nebulynk Fira Sans',
    files: [
      { url: firaSansRegularUrl, weight: 400, format: 'woff2' },
      { url: firaSansMediumUrl, weight: 500, format: 'woff2' }
    ]
  },
  'ibm-plex-sans': {
    label: 'IBM Plex Sans',
    family: 'Nebulynk IBM Plex Sans',
    files: [
      { url: ibmPlexSansRegularUrl, weight: 400, format: 'truetype' },
      { url: ibmPlexSansMediumUrl, weight: 500, format: 'truetype' }
    ]
  },
  system: {
    label: 'System',
    family: '',
    files: []
  }
}

export function normalizeFontFamily(value, fallback = DEFAULT_FONT_FAMILY) {
  return FONT_FAMILY_OPTIONS.includes(value) ? value : fallback
}

export function getFontFamilyOptions() {
  return FONT_FAMILY_OPTIONS.map((value) => ({
    label: FONT_DEFINITIONS[value].label,
    value
  }))
}

export function getFontFamilyStack(value = DEFAULT_FONT_FAMILY) {
  const normalized = normalizeFontFamily(value)
  const definition = FONT_DEFINITIONS[normalized]
  if (!definition?.family) return SYSTEM_FONT_STACK
  return `"${definition.family}", ${SYSTEM_FONT_STACK}`
}

export function getFontFaceCss(value = DEFAULT_FONT_FAMILY) {
  const normalized = normalizeFontFamily(value)
  const definition = FONT_DEFINITIONS[normalized]
  if (!definition?.family || !definition.files.length) return ''

  return definition.files.map((file) => `@font-face {
  font-family: "${definition.family}";
  font-style: normal;
  font-weight: ${file.weight};
  font-display: swap;
  src: url("${file.url}") format("${file.format}");
}`).join('\n\n')
}
