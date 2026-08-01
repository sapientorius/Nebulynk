import { zzfx, ZZFX } from 'zzfx'
import { isAppBackgrounded } from './desktop-window-state.js'

export const SFX_EVENTS = Object.freeze({
  NOTIFICATION: 'notification',
  VOICE_JOIN_SELF: 'voice_join_self',
  VOICE_JOIN_OTHER: 'voice_join_other',
  VOICE_PTT_SELF_DOWN: 'voice_ptt_self_down',
  VOICE_PTT_SELF_UP: 'voice_ptt_self_up',
  VOICE_LEAVE_OTHER: 'voice_leave_other',
  VOICE_LEAVE_SELF: 'voice_leave_self',
  CALL_INCOMING: 'call_incoming',
  CALL_OUTGOING: 'call_outgoing',
  ERROR_VOICE_CALL: 'error_voice_call'
})

// ZzFX global output volume (0..1).
ZZFX.volume = 0.35

const lastPlayedAt = new Map()

const EVENT_RULES = Object.freeze({
  [SFX_EVENTS.NOTIFICATION]: {
    onlyWhenHidden: true,
    throttleKey: 'notification',
    throttleMs: 1000
  }
})

// Retro/chiptune-like presets.
const PRESETS = Object.freeze({
  [SFX_EVENTS.NOTIFICATION]: [1.1, 0, 784, 0.01, 0.08, 0.16, 2, 2.2, 0, 0, 110, 0.02, 0.03],
  [SFX_EVENTS.VOICE_JOIN_SELF]: [1.2, 0, 440, 0.02, 0.08, 0.22, 1, 1.4, 120, 0, 0, 0, 0.02],
  [SFX_EVENTS.VOICE_JOIN_OTHER]: [0.9, 0, 330, 0.01, 0.07, 0.14, 1, 1.8, 40, 0, 0, 0, 0.02],
  [SFX_EVENTS.VOICE_PTT_SELF_DOWN]: [0.7, 0, 170, 0, 0.03, 0.06, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.01],
  [SFX_EVENTS.VOICE_PTT_SELF_UP]: [0.7, 0, 240, 0, 0.02, 0.05, 0, 0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0.01],
  [SFX_EVENTS.VOICE_LEAVE_OTHER]: [0.9, 0, 280, 0.01, 0.06, 0.14, 1, 1.7, -60, 0, 0, 0, 0.02],
  [SFX_EVENTS.VOICE_LEAVE_SELF]: [1.2, 0, 360, 0.01, 0.08, 0.22, 1, 1.4, -160, 0, 0, 0, 0.02],
  [SFX_EVENTS.CALL_INCOMING]: [1.1, 0.04, 660, 0.01, 0.09, 0.22, 2, 1.6, 0, 0, -90, 0.1, 0.28],
  [SFX_EVENTS.CALL_OUTGOING]: [1, 0, 520, 0.01, 0.08, 0.18, 1, 1.5, 70, 0, 0, 0, 0.18],
  [SFX_EVENTS.ERROR_VOICE_CALL]: [1.1, 0.03, 190, 0.01, 0.09, 0.24, 0, 0.8, -140, 0, 0, 0, 0.04, 0.2]
})

export function playSfx(eventName, options = {}) {
  const preset = PRESETS[eventName]
  if (!preset) return false

  const rule = EVENT_RULES[eventName] || {}
  const onlyWhenHidden = options.onlyWhenHidden ?? rule.onlyWhenHidden ?? false
  const throttleKey = options.throttleKey ?? rule.throttleKey ?? eventName
  const throttleMs = options.throttleMs ?? rule.throttleMs ?? 0

  if (onlyWhenHidden && !isDocumentHidden()) return false

  if (throttleMs > 0) {
    const now = Date.now()
    const last = lastPlayedAt.get(throttleKey) || 0
    if (now - last < throttleMs) return false
    lastPlayedAt.set(throttleKey, now)
  }

  try {
    zzfx(...preset)
    return true
  } catch (error) {
    console.warn('[SFX] Playback failed:', eventName, error)
    return false
  }
}

function isDocumentHidden() {
  if (typeof document === 'undefined') return false
  return isAppBackgrounded(document)
}
