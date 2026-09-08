import axios from 'axios'
import { resolveApiBaseUrlFromOptions } from './base-url.js'
import { redirectToLoginIfNeeded } from './session.js'

const SESSION_ROUTE_PATTERN = /\/auth\/session(?:\/bootstrap|\/refresh)?$/

const AUTHENTICATION_ROUTE_PATTERN = /\/authentication$/

function isFormDataPayload(data) {
if (!data || typeof FormData === 'undefined') return false
return data instanceof FormData
}

function deleteHeader(headers, headerName) {
if (!headers || !headerName) return
if (typeof headers.delete === 'function') {
headers.delete(headerName)
return
}

const normalizedHeaderName = headerName.toLowerCase()
for (const key of Object.keys(headers)) {
if (key.toLowerCase() === normalizedHeaderName) {
delete headers[key]
}
}
}

function shouldSkipRefreshRetry(config = {}) {
const url = String(config.url || '')
return config.__skipAuthRefresh === true
    || AUTHENTICATION_ROUTE_PATTERN.test(url)
    || SESSION_ROUTE_PATTERN.test(url)
}

export function createHttpTransport(options = {}) {
  const http = axios.create({
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json'
    }
  })

  function getBaseUrl() {
    return resolveApiBaseUrlFromOptions(options)
  }

  function resolveApiUrl(path = '') {
    const apiBaseUrl = getBaseUrl()
    if (!path) return apiBaseUrl
    if (/^https?:\/\//i.test(path)) return path

    if (path.startsWith('/api/')) {
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return `${apiBaseUrl}${path.slice(4)}`
      }
      return path
    }

    if (path === '/api') {
      return apiBaseUrl
    }

    if (path.startsWith('/')) {
      if (/^https?:\/\//i.test(apiBaseUrl)) {
        return `${apiBaseUrl}${path}`
      }
      return `${apiBaseUrl}${path}`
    }

    return `${apiBaseUrl}/${path}`
  }

  function installSessionInterceptors({ getStoredAccessToken, clearStoredAuth, restoreBrowserSession }) {
    http.interceptors.request.use((config) => {
      const token = getStoredAccessToken()
      if (token) {
        config.headers = config.headers || {}
        if (!config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`
        }
      }
      if (isFormDataPayload(config.data)) {
        config.headers = config.headers || {}
        deleteHeader(config.headers, 'Content-Type')
      }
      config.withCredentials = true
      config.baseURL = getBaseUrl()
      return config
    })

    http.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error?.config || null
        const status = error?.response?.status
  
        if (status !== 401 || !config || shouldSkipRefreshRetry(config) || config.__authRetryAttempted) {
          return Promise.reject(error)
        }
  
        if (!getStoredAccessToken()) {
          clearStoredAuth()
          if (options.redirectOnAuthFailure !== false) {
            redirectToLoginIfNeeded()
          }
          return Promise.reject(error)
        }
  
        config.__authRetryAttempted = true
  
        try {
          const refreshed = await restoreBrowserSession({ forceRefresh: true })
          if (!refreshed?.accessToken) {
            throw error
          }
  
          config.headers = config.headers || {}
          config.headers.Authorization = `Bearer ${refreshed.accessToken}`
          return http(config)
        } catch {
          clearStoredAuth()
          if (options.redirectOnAuthFailure !== false) {
            redirectToLoginIfNeeded()
          }
          return Promise.reject(error)
        }
      }
    )
  }

  return { http, getBaseUrl, resolveApiUrl, installSessionInterceptors }
}
