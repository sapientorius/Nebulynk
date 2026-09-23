self.importScripts('/share-target-storage.js')

const SHARE_TARGET_PATH = '/share-target'

function normalizeUnreadCount(value) {
  const count = Number(value)
  if (!Number.isFinite(count)) return null
  return Math.max(0, Math.trunc(count))
}

async function syncAppBadge(unreadCount) {
  const count = normalizeUnreadCount(unreadCount)
  if (count === null) return false

  try {
    if (count > 0 && typeof self.navigator?.setAppBadge === 'function') {
      await self.navigator.setAppBadge(count)
      return true
    }
    if (count === 0 && typeof self.navigator?.clearAppBadge === 'function') {
      await self.navigator.clearAppBadge()
      return true
    }
  } catch {
    // Badging is a best-effort enhancement and must not block push delivery.
  }

  return false
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  const isShareTargetRequest = event.request.method === 'POST'
    && requestUrl.origin === self.location.origin
    && requestUrl.pathname === SHARE_TARGET_PATH

  if (!isShareTargetRequest) return

  event.respondWith((async () => {
    try {
      const formData = await event.request.formData()
      const payload = await self.NebulynkShareTargetStorage.storeFormData(formData)
      const destination = new URL(`/share/${encodeURIComponent(payload.id)}`, self.location.origin)
      return Response.redirect(destination.toString(), 303)
    } catch (error) {
      console.error('Failed to receive shared content:', error)
      const destination = new URL('/share?error=storage', self.location.origin)
      return Response.redirect(destination.toString(), 303)
    }
  })())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Nebulynk', body: event.data.text(), url: '/' }
  }

  const title = payload.title || 'Nebulynk'
  const options = {
    body: payload.body || '',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/' },
    tag: payload.tag || 'nebulynk-notification'
  }

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    syncAppBadge(payload.unreadCount)
  ]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
