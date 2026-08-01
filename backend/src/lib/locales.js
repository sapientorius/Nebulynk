export const SUPPORTED_LOCALES = ['en', 'de']
export const DEFAULT_LOCALE = 'en'

export function isSupportedLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale)
}

export function normalizeLocale(locale, fallback = DEFAULT_LOCALE) {
  if (typeof locale !== 'string') return fallback
  const candidate = locale.trim().toLowerCase()
  if (!candidate) return fallback
  return isSupportedLocale(candidate) ? candidate : fallback
}
