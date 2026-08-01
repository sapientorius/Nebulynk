import { watch } from 'vue'
import { activateDesktopProfile, revealDesktopWindow, setDesktopPttBinding } from './desktop-bridge.js'
import { listenDesktopNotificationActions } from './desktop-notification-plugin.js'
import { getActiveDesktopProfile, desktopState } from './desktop-runtime.js'
import { normalizeDesktopNotificationTarget } from './desktop-notification-route.js'
import { createDesktopPttBindingPayload } from './desktop-ptt-shortcut.js'

async function applyActivePttShortcut() {
  const activeProfile = getActiveDesktopProfile()
  if (!activeProfile?.authState?.accessToken) {
    await setDesktopPttBinding({
      mode: 'live',
      keyCode: null,
      allowPassThrough: true,
      platformStrategy: 'auto'
    }).catch(() => {})
    return
  }

  const pttConfig = activeProfile.pttConfig || {}
  await setDesktopPttBinding(createDesktopPttBindingPayload(pttConfig)).catch(() => {})
}

export async function startDesktopManagerController() {
  const cleanup = []

  async function openNotificationTarget(payload) {
    const target = normalizeDesktopNotificationTarget(payload)
    if (!target.serverId) return
    await activateDesktopProfile(target.serverId, target.route).catch(() => {})
    await revealDesktopWindow().catch(() => {})
  }

  cleanup.push(await listenDesktopNotificationActions((payload) => {
    openNotificationTarget(payload).catch(() => {})
  }))

  cleanup.push(watch(
    () => desktopState.profiles.map((profile) => ({
      id: profile.id,
      accessToken: profile.authState?.accessToken || null,
      mode: profile.pttConfig?.mode || 'live',
      pttKey: profile.pttConfig?.pttKey || 'Space',
      active: profile.id === desktopState.activeProfileId
    })),
    () => {
      applyActivePttShortcut().catch(() => {})
    },
    {
      deep: true,
      immediate: true
    }
  ))

  return () => {
    for (const stop of cleanup) {
      if (typeof stop === 'function') {
        stop()
      }
    }
  }
}
