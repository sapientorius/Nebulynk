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
