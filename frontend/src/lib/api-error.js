import { t } from './i18n.js'

function getErrorData(error) {
  return error?.response?.data || null
}

export function getApiErrorCode(error) {
  const data = getErrorData(error)
  if (!data || typeof data !== 'object') return null
  if (typeof data.error_code === 'string' && data.error_code.trim()) return data.error_code
  if (data.data && typeof data.data === 'object' && typeof data.data.error_code === 'string' && data.data.error_code.trim()) {
    return data.data.error_code
  }
  return null
}

export function getApiErrorParams(error) {
  const data = getErrorData(error)
  if (!data || typeof data !== 'object') return {}
  if (data.error_params && typeof data.error_params === 'object') return data.error_params
  if (data.data && typeof data.data === 'object' && data.data.error_params && typeof data.data.error_params === 'object') {
    return data.data.error_params
  }
  return {}
}

export function getApiErrorMessage(error) {
  const data = getErrorData(error)
  if (!data || typeof data !== 'object') return null
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  if (typeof data.error === 'string' && data.error.trim()) return data.error
  return null
}

export function translateApiError(error, fallbackKey = 'errors.unexpected', fallbackParams = {}) {
  const code = getApiErrorCode(error)
  if (code) {
    const translated = t(code, getApiErrorParams(error))
    if (translated !== code) return translated
    return t(fallbackKey, fallbackParams)
  }

  return t(fallbackKey, fallbackParams)
}
