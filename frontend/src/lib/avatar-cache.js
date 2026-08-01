import { getStoredAccessToken, resolveApiUrl } from './api.js'

const avatarObjectUrlCache = new Map()
const inFlightAvatarRequests = new Map()

export function isManagedAvatarUrl(url) {
  return typeof url === 'string' && /^\/api\/users\/[^/]+\/avatar(?:\?|$)/.test(url)
}

export function clearAvatarCache() {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const objectUrl of avatarObjectUrlCache.values()) {
      URL.revokeObjectURL(objectUrl)
    }
  }

  avatarObjectUrlCache.clear()
  inFlightAvatarRequests.clear()
}

export async function resolveAvatarSource(url) {
  if (!url) return null

  if (!isManagedAvatarUrl(url)) {
    return url
  }

  if (avatarObjectUrlCache.has(url)) {
    return avatarObjectUrlCache.get(url)
  }

  if (inFlightAvatarRequests.has(url)) {
    return inFlightAvatarRequests.get(url)
  }

  if (typeof fetch !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null
  }

  const token = getStoredAccessToken()
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const requestUrl = resolveApiUrl(url)

  const request = fetch(requestUrl, { headers })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Avatar request failed: ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      avatarObjectUrlCache.set(url, objectUrl)
      return objectUrl
    })
    .finally(() => {
      inFlightAvatarRequests.delete(url)
    })

  inFlightAvatarRequests.set(url, request)
  return request
}
