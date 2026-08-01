import { DEFAULT_LOCALE, normalizeLocale } from './locales.js'
import { backendMessages } from './i18n-messages.js'

function resolveMessage(locale, key) {
  const parts = String(key).split('.')
  let cursor = backendMessages[locale]
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) {
      return null
    }
    cursor = cursor[part]
  }
  return typeof cursor === 'string' ? cursor : null
}

function interpolate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`))
}

export function bt(locale, key, params) {
  const normalized = normalizeLocale(locale, DEFAULT_LOCALE)
  const localized = resolveMessage(normalized, key)
  if (localized) return interpolate(localized, params)
  const fallback = resolveMessage(DEFAULT_LOCALE, key)
  if (fallback) return interpolate(fallback, params)
  return key
}
