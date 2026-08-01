import { t } from './i18n.js'

export const SUPPORTED_MEETING_LANGUAGES = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pl', 'pt']

export const DEFAULT_MEETING_LANGUAGE = 'en'

export function isSupportedMeetingLanguage(value) {
  return SUPPORTED_MEETING_LANGUAGES.includes(value)
}

export function normalizeMeetingLanguage(value, fallback = DEFAULT_MEETING_LANGUAGE) {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : ''

  return isSupportedMeetingLanguage(normalized) ? normalized : fallback
}

export function getMeetingLanguageLabel(language, tFn = t) {
  const key = typeof language === 'string' ? language.trim().toLowerCase() : ''
  return tFn(`languages.${key || 'en'}`)
}

export function getMeetingLanguageOptions(tFn = t) {
  return SUPPORTED_MEETING_LANGUAGES.map((language) => ({
    label: getMeetingLanguageLabel(language, tFn),
    value: language
  }))
}
