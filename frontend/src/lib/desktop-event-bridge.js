import { listenDesktop, revealDesktopWindow } from './desktop-bridge.js'
import { listenDesktopNotificationActions } from './desktop-notification-plugin.js'
import { updateDesktopWindowState } from './desktop-window-state.js'
import { normalizeDesktopNotificationTarget } from './desktop-notification-route.js'
import {
  getActiveDesktopProfile,
  getDesktopProfileById,
  setActiveDesktopProfile,
  setDesktopProfileLastRoute
} from './desktop-runtime.js'
import * as micActivation from './mic-activation.js'
import { useSessionStore } from '../stores/session.js'

async function switchDesktopRoute({ sessionStore, router, serverId, route }) {
  const targetProfile = getDesktopProfileById(serverId)
  if (!targetProfile) return

  if (getActiveDesktopProfile()?.id !== targetProfile.id) {
    await sessionStore.destroy()
    await setActiveDesktopProfile(targetProfile.id)
  }

  if (targetProfile.authState?.accessToken) {
    await sessionStore.init().catch(() => {})
    await router.push(route).catch(() => {})
    await setDesktopProfileLastRoute(targetProfile.id, route)
    return
  }

  await router.push('/login').catch(() => {})
}

export async function startDesktopEventBridge({ pinia, router }) {
  const cleanup = []
  const sessionStore = useSessionStore(pinia)
  const openDesktopNotificationTarget = (payload) => {
    const target = normalizeDesktopNotificationTarget(payload)
    if (!target.serverId) return
    revealDesktopWindow().catch(() => {})
    switchDesktopRoute({
      sessionStore,
      router,
      serverId: target.serverId,
      route: target.route
    }).catch(() => {})
  }

  cleanup.push(await listenDesktopNotificationActions((payload) => {
    openDesktopNotificationTarget(payload)
  }))

  cleanup.push(await listenDesktop('desktop:notification-open', async (payload) => {
    openDesktopNotificationTarget(payload)
  }))

  cleanup.push(await listenDesktop('desktop:window-state', (payload) => {
    updateDesktopWindowState(payload)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nebulynk:desktop-window-state', {
        detail: payload
      }))
    }
  }))

  cleanup.push(await listenDesktop('desktop:ptt-down', () => {
    micActivation.triggerExternalPttDown()
  }))

  cleanup.push(await listenDesktop('desktop:ptt-up', () => {
    micActivation.triggerExternalPttUp()
  }))

  cleanup.push(router.afterEach((to) => {
    const activeProfile = getActiveDesktopProfile()
    if (!activeProfile) return
    setDesktopProfileLastRoute(activeProfile.id, to.fullPath).catch(() => {})
  }))

  return () => {
    for (const stop of cleanup) {
      if (typeof stop === 'function') {
        stop()
      }
    }
  }
}
