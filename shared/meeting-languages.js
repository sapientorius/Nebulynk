export const SUPPORTED_MEETING_LANGUAGES = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pl', 'pt']
export const DEFAULT_MEETING_LANGUAGE = 'en'

export function isSupportedMeetingLanguage(language) {
  return SUPPORTED_MEETING_LANGUAGES.includes(language)
}

export function normalizeMeetingLanguage(language, fallback = DEFAULT_MEETING_LANGUAGE) {
  if (typeof language !== 'string') return fallback
  const candidate = language.trim().toLowerCase()
  if (!candidate) return fallback
  return isSupportedMeetingLanguage(candidate) ? candidate : fallback
}
