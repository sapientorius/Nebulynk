import { normalizeApiBaseUrl } from './base-url.js'

const PLATFORM_STATUS_CACHE = new Map()

function getPlatformStatusCacheEntry(baseUrl) {
  const cacheKey = normalizeApiBaseUrl(baseUrl)
  let entry = PLATFORM_STATUS_CACHE.get(cacheKey)
  if (!entry) {
    entry = {
      value: null,
      loaded: false,
      promise: null
    }
    PLATFORM_STATUS_CACHE.set(cacheKey, entry)
  }
  return entry
}

function setCachedPlatformStatus(baseUrl, value) {
  const entry = getPlatformStatusCacheEntry(baseUrl)
  entry.value = value || {}
  entry.loaded = true
  entry.promise = null
  return entry.value
}

function clearCachedPlatformStatus(baseUrl) {
  const entry = getPlatformStatusCacheEntry(baseUrl)
  entry.promise = null
  entry.loaded = false
  entry.value = null
}

export function createPlatformEndpoints({ http, getBaseUrl }) {
  async function getPlatformStatus({ refresh = false } = {}) {
    const baseUrl = getBaseUrl()
    const cacheEntry = getPlatformStatusCacheEntry(baseUrl)

    if (!refresh && cacheEntry.loaded) {
      return cacheEntry.value
    }

    if (cacheEntry.promise) {
      return cacheEntry.promise
    }

    cacheEntry.promise = http.get('/platform')
      .then(({ data }) => setCachedPlatformStatus(baseUrl, data))
      .catch((error) => {
        cacheEntry.promise = null
        throw error
      })

    return cacheEntry.promise
  }

  async function setupPlatform(payload) {
    const { data } = await http.post('/platform', payload)
    return setCachedPlatformStatus(getBaseUrl(), data)
  }

  async function updatePlatformSettings(payload) {
    const baseUrl = getBaseUrl()
    try {
      const { data } = await http.patch('/platform', payload)
      return setCachedPlatformStatus(baseUrl, data)
    } catch (error) {
      clearCachedPlatformStatus(baseUrl)
      throw error
    }
  }

  async function getSelfRegistrationConfig() {
    const { data } = await http.get('/self-registration', {
      __skipAuthRefresh: true
    })
    return data
  }

  async function createSelfRegistration(payload) {
    const { data } = await http.post('/self-registration', payload, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function confirmSelfRegistration(token) {
    const { data } = await http.patch(`/self-registration/${encodeURIComponent(token)}`, {}, {
      __skipAuthRefresh: true
    })
    return data
  }

  async function getRegistrationSettings() {
    const { data } = await http.get('/registration-settings')
    return data
  }

  async function updateRegistrationSettings(payload) {
    const { data } = await http.patch('/registration-settings/default', payload)
    return data
  }

  async function listPendingRegistrations() {
    const { data } = await http.get('/pending-registrations')
    return data
  }

  async function getPendingRegistrationSummary() {
    const { data } = await http.get('/pending-registration-summary')
    return data
  }

  async function confirmPendingRegistration(id) {
    const { data } = await http.patch(`/pending-registrations/${encodeURIComponent(id)}`, {
      action: 'confirm'
    })
    return data
  }

  async function deletePendingRegistration(id) {
    const { data } = await http.delete(`/pending-registrations/${encodeURIComponent(id)}`)
    return data
  }

  return { getPlatformStatus, setupPlatform, updatePlatformSettings, getSelfRegistrationConfig, createSelfRegistration, confirmSelfRegistration, getRegistrationSettings, updateRegistrationSettings, listPendingRegistrations, getPendingRegistrationSummary, confirmPendingRegistration, deletePendingRegistration }
}
