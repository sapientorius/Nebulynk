import { getRoom } from './livekit.js'
import { Track } from 'livekit-client'
import { playSfx, SFX_EVENTS } from './sfx.js'
import {
  DEFAULT_DESKTOP_PTT_BINDING_STATUS,
  normalizeDesktopPttBindingStatus,
  shouldUseDesktopPttEventBinding
} from './desktop-ptt-shortcut.js'
import { desktopWindowState } from './desktop-window-state.js'
import { isDesktopWorkspaceWindow } from './runtime.js'

// === Constants ===
export const MIC_MODE_LIVE = 'live'
export const MIC_MODE_VAD = 'vad'
export const MIC_MODE_PTT = 'ptt'

// === Module state ===
let currentMode = MIC_MODE_LIVE
let vadAnalyser = null
let vadAudioContext = null
let vadSource = null
let vadAnimFrame = null
let vadTimeout = null
let vadThreshold = 15
let vadSilenceDelay = 300
let pttKey = 'Space'
let vadClonedTrack = null
let keyboardPttActive = false
let externalPttActive = false
let isTransmitting = false
let manualMuteOverride = false
let modeActive = false
let currentLevel = 0
let onTransmitChange = null
let initialized = false
const settingsListeners = new Set()
let desktopPttBindingStatus = {
  ...DEFAULT_DESKTOP_PTT_BINDING_STATUS
}

const STORAGE_KEY = 'voiceMicSettings'

function shouldPersistMicSettingsToLocalStorage() {
  return typeof localStorage !== 'undefined' && !isDesktopWorkspaceWindow()
}

// === Key display names (German) ===
const KEY_NAMES = {
  Space: 'Leertaste',
  ControlLeft: 'Strg Links',
  ControlRight: 'Strg Rechts',
  ShiftLeft: 'Shift Links',
  ShiftRight: 'Shift Rechts',
  AltLeft: 'Alt Links',
  AltRight: 'Alt Rechts',
  CapsLock: 'Feststelltaste',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Pfeil hoch',
  ArrowDown: 'Pfeil runter',
  ArrowLeft: 'Pfeil links',
  ArrowRight: 'Pfeil rechts',
  Insert: 'Einfg',
  Delete: 'Entf',
  Home: 'Pos1',
  End: 'Ende',
  PageUp: 'Bild hoch',
  PageDown: 'Bild runter',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Rücktaste',
  NumpadEnter: 'Numpad Enter',
  NumpadAdd: 'Numpad +',
  NumpadSubtract: 'Numpad -',
  NumpadMultiply: 'Numpad *',
  NumpadDivide: 'Numpad /',
  NumpadDecimal: 'Numpad .',
  NumLock: 'Num Lock',
  ScrollLock: 'Scroll Lock'
}

// === Public API ===

export function init(opts) {
  onTransmitChange = opts?.onTransmitChange || null
  initialized = true
  isTransmitting = true // Match actual track state (mic enabled by connectToRoom)
  manualMuteOverride = false
  modeActive = false // Force next setMode() to activate
  loadSettings()
}

export function destroy() {
  stopVad()
  stopPtt()
  initialized = false
  modeActive = false
  isTransmitting = false
  manualMuteOverride = false
  currentLevel = 0
  onTransmitChange = null
  desktopPttBindingStatus = {
    ...DEFAULT_DESKTOP_PTT_BINDING_STATUS
  }
}

export function getMode() {
  return currentMode
}

export function setMode(mode) {
  if (mode === currentMode && modeActive) return

  // Cleanup previous mode
  stopVad()
  stopPtt()
  modeActive = false

  currentMode = mode

  if (!initialized) return

  // Start new mode
  switch (mode) {
    case MIC_MODE_LIVE:
      // Unmute track if not manually muted
      if (!manualMuteOverride) {
        setTransmitting(true)
      }
      break
    case MIC_MODE_VAD:
      startVad()
      break
    case MIC_MODE_PTT:
      startPtt()
      break
  }

  modeActive = true
  emitSettingsChanged()
}

export function restartMode() {
  if (!initialized || !modeActive) return
  modeActive = false
  setMode(currentMode)
}

export function setManualMute(muted) {
  manualMuteOverride = muted
  if (muted) {
    // Force mute regardless of mode
    setTransmitting(false)
  } else {
    // Resume mode behavior
    if (currentMode === MIC_MODE_LIVE) {
      setTransmitting(true)
    }
    // VAD/PTT will handle unmuting on their own triggers
  }
}

export function getManualMute() {
  return manualMuteOverride
}

export function setVadThreshold(value) {
  vadThreshold = Math.max(1, Math.min(50, value))
  emitSettingsChanged()
}

export function getVadThreshold() {
  return vadThreshold
}

export function setVadSilenceDelay(ms) {
  vadSilenceDelay = ms
  emitSettingsChanged()
}

export function getVadSilenceDelay() {
  return vadSilenceDelay
}

export function setPttKey(keyCode) {
  pttKey = keyCode
  emitSettingsChanged()
}

export function getPttKey() {
  return pttKey
}

export function getDisplayKeyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code]
  // KeyX → X, DigitX → X, FX → FX
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad') && code !== 'NumpadEnter') return 'Numpad ' + code.slice(6)
  if (/^F\d+$/.test(code)) return code
  return code
}

export function getCurrentLevel() {
  return currentLevel
}

export function isCurrentlyTransmitting() {
  return isTransmitting
}

function hasActiveVoiceSession() {
  return !!getMicTrack()
}

export function triggerExternalPttDown() {
  if (!hasActiveVoiceSession() || manualMuteOverride || currentMode !== MIC_MODE_PTT) return
  const wasActive = externalPttActive
  externalPttActive = true
  setTransmitting(true)
  if (!wasActive) {
    playSfx(SFX_EVENTS.VOICE_PTT_SELF_DOWN)
  }
}

export function triggerExternalPttUp() {
  const wasActive = externalPttActive
  externalPttActive = false
  if (!hasActiveVoiceSession()) return
  if (currentMode !== MIC_MODE_PTT) return
  if (manualMuteOverride) return
  if (!keyboardPttActive) {
    setTransmitting(false)
  }
  if (wasActive) {
    playSfx(SFX_EVENTS.VOICE_PTT_SELF_UP)
  }
}

// === Persistence ===

export function saveSettings() {
  if (shouldPersistMicSettingsToLocalStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: currentMode,
      vadThreshold,
      vadSilenceDelay,
      pttKey
    }))
  }
  emitSettingsChanged()
}

export function loadSettings() {
  if (!shouldPersistMicSettingsToLocalStorage()) {
    emitSettingsChanged()
    return
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const s = JSON.parse(raw)
    if (s.mode) currentMode = s.mode
    if (typeof s.vadThreshold === 'number') vadThreshold = s.vadThreshold
    if (typeof s.vadSilenceDelay === 'number') vadSilenceDelay = s.vadSilenceDelay
    if (s.pttKey) pttKey = s.pttKey
  } catch {
    // Ignore corrupt data
  }
  emitSettingsChanged()
}

export function getSettingsSnapshot() {
  return {
    mode: currentMode,
    vadThreshold,
    vadSilenceDelay,
    pttKey
  }
}

export function setDesktopPttBindingStatus(status) {
  desktopPttBindingStatus = normalizeDesktopPttBindingStatus(status)

  if (shouldUseDesktopPttEventBinding(desktopPttBindingStatus) && keyboardPttActive) {
    keyboardPttActive = false
    if (!externalPttActive && currentMode === MIC_MODE_PTT && !manualMuteOverride) {
      setTransmitting(false)
    }
  }
}

export function getDesktopPttBindingStatus() {
  return {
    ...desktopPttBindingStatus
  }
}

export function subscribeToSettings(listener) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  settingsListeners.add(listener)
  listener(getSettingsSnapshot())
  return () => {
    settingsListeners.delete(listener)
  }
}

function emitSettingsChanged() {
  const snapshot = getSettingsSnapshot()
  for (const listener of settingsListeners) {
    listener(snapshot)
  }
}

// === Internal: Track mute/unmute ===

function getMicTrack() {
  const room = getRoom()
  if (!room) return null
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  return pub?.track || null
}

function setTransmitting(transmit) {
  if (transmit === isTransmitting) return
  isTransmitting = transmit

  const track = getMicTrack()
  if (!track) return

  if (transmit) {
    track.unmute()
  } else {
    track.mute()
  }

  onTransmitChange?.(transmit)
}

// === Internal: VAD ===

function startVad() {
  const track = getMicTrack()
  if (!track) return

  const mediaStreamTrack = track.mediaStreamTrack
  if (!mediaStreamTrack) return

  try {
    // Clone the track so VAD analysis is independent of LiveKit mute state.
    // Muting the original track sets mediaStreamTrack.enabled=false,
    // which would silence the analyser. The clone stays enabled.
    vadClonedTrack = mediaStreamTrack.clone()

    vadAudioContext = new AudioContext()
    vadSource = vadAudioContext.createMediaStreamSource(new MediaStream([vadClonedTrack]))
    vadAnalyser = vadAudioContext.createAnalyser()
    vadAnalyser.fftSize = 512
    vadAnalyser.smoothingTimeConstant = 0.3
    vadSource.connect(vadAnalyser)

    // Ensure AudioContext is running (browser autoplay policy)
    if (vadAudioContext.state === 'suspended') {
      vadAudioContext.resume()
    }
  } catch (error) {
    console.error('Failed to create VAD AudioContext:', error)
    if (vadClonedTrack) {
      vadClonedTrack.stop()
      vadClonedTrack = null
    }
    return
  }

  const dataArray = new Uint8Array(vadAnalyser.frequencyBinCount)
  let speaking = false

  // Start muted until speech detected
  if (!manualMuteOverride) {
    setTransmitting(false)
  }

  function analyzeLoop() {
    vadAnimFrame = requestAnimationFrame(analyzeLoop)
    if (!vadAnalyser) return

    vadAnalyser.getByteFrequencyData(dataArray)

    // Calculate RMS volume (0-100 scale)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / dataArray.length)
    currentLevel = Math.min(100, (rms / 255) * 100 * 2)

    if (manualMuteOverride) return

    if (currentLevel > vadThreshold) {
      // Speech detected
      clearTimeout(vadTimeout)
      vadTimeout = null
      if (!speaking) {
        speaking = true
        setTransmitting(true)
      }
    } else if (speaking) {
      // Below threshold — start silence timer
      if (!vadTimeout) {
        vadTimeout = setTimeout(() => {
          speaking = false
          setTransmitting(false)
          vadTimeout = null
        }, vadSilenceDelay)
      }
    }
  }

  analyzeLoop()
}

function stopVad() {
  if (vadAnimFrame) {
    cancelAnimationFrame(vadAnimFrame)
    vadAnimFrame = null
  }
  clearTimeout(vadTimeout)
  vadTimeout = null
  if (vadSource) {
    vadSource.disconnect()
    vadSource = null
  }
  if (vadAudioContext) {
    vadAudioContext.close().catch(() => {})
    vadAudioContext = null
  }
  if (vadClonedTrack) {
    vadClonedTrack.stop()
    vadClonedTrack = null
  }
  vadAnalyser = null
  currentLevel = 0
}

// === Internal: PTT ===

function startPtt() {
  // Start muted
  if (!manualMuteOverride) {
    setTransmitting(false)
  }
  window.addEventListener('keydown', onPttKeyDown)
  window.addEventListener('keyup', onPttKeyUp)
  window.addEventListener('blur', onPttBlur)
}

function stopPtt() {
  window.removeEventListener('keydown', onPttKeyDown)
  window.removeEventListener('keyup', onPttKeyUp)
  window.removeEventListener('blur', onPttBlur)
  if (keyboardPttActive || externalPttActive) {
    keyboardPttActive = false
    externalPttActive = false
    setTransmitting(false)
  }
}

function onPttKeyDown(e) {
  if (shouldUseDesktopPttEventBinding(desktopPttBindingStatus)) return
  if (e.code !== pttKey) return
  if (e.repeat) return
  if (!hasActiveVoiceSession()) return
  if (manualMuteOverride) return
  // Don't trigger when typing in inputs
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return
  e.preventDefault()
  keyboardPttActive = true
  setTransmitting(true)
  playSfx(SFX_EVENTS.VOICE_PTT_SELF_DOWN)
}

function onPttKeyUp(e) {
  if (shouldUseDesktopPttEventBinding(desktopPttBindingStatus)) return
  if (e.code !== pttKey) return
  if (!hasActiveVoiceSession()) return
  e.preventDefault()
  keyboardPttActive = false
  if (!externalPttActive) {
    setTransmitting(false)
  }
  playSfx(SFX_EVENTS.VOICE_PTT_SELF_UP)
}

function onPttBlur() {
  if (keyboardPttActive) {
    keyboardPttActive = false
    if (!externalPttActive) {
      setTransmitting(false)
    }
    playSfx(SFX_EVENTS.VOICE_PTT_SELF_UP)
  }
}
