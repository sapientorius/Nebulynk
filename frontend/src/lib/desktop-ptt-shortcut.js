const DIRECT_CODE_MAPPINGS = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  CapsLock: 'CapsLock',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  NumpadAdd: 'NumpadAdd',
  NumpadSubtract: 'NumpadSubtract',
  NumpadMultiply: 'NumpadMultiply',
  NumpadDivide: 'NumpadDivide',
  NumpadDecimal: 'NumpadDecimal',
  NumpadEnter: 'NumpadEnter'
}

const TEXT_ENTRY_PUNCTUATION_KEYS = new Set([
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash'
])

export const DEFAULT_DESKTOP_PTT_BINDING_STATUS = Object.freeze({
  mode: 'focused-only',
  keyCode: null,
  isGlobal: false,
  usesNativeHook: false,
  usesRawInput: false,
  allowPassThrough: false,
  platform: 'unknown',
  reason: null
})

export function isDesktopPttTextEntryKey(keyCode) {
  if (typeof keyCode !== 'string') return false
  const trimmed = keyCode.trim()
  if (!trimmed) return false

  if (trimmed === 'Space') return true
  if (/^Key[A-Z]$/i.test(trimmed)) return true
  if (/^Digit[0-9]$/.test(trimmed)) return true
  if (/^Numpad[0-9]$/.test(trimmed)) return true
  if (['NumpadDecimal', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide'].includes(trimmed)) {
    return true
  }

  return TEXT_ENTRY_PUNCTUATION_KEYS.has(trimmed)
}

export function normalizeDesktopPttBindingStatus(status) {
  if (!status || typeof status !== 'object') {
    return {
      ...DEFAULT_DESKTOP_PTT_BINDING_STATUS
    }
  }

  const mode = typeof status.mode === 'string' && status.mode.trim()
    ? status.mode.trim()
    : DEFAULT_DESKTOP_PTT_BINDING_STATUS.mode
  const keyCode = typeof status.keyCode === 'string' && status.keyCode.trim()
    ? status.keyCode.trim()
    : null
  const platform = typeof status.platform === 'string' && status.platform.trim()
    ? status.platform.trim()
    : DEFAULT_DESKTOP_PTT_BINDING_STATUS.platform
  const reason = typeof status.reason === 'string' && status.reason.trim()
    ? status.reason.trim()
    : null

  return {
    mode,
    keyCode,
    isGlobal: status.isGlobal === true,
    usesNativeHook: status.usesNativeHook === true,
    usesRawInput: status.usesRawInput === true,
    allowPassThrough: status.allowPassThrough === true,
    platform,
    reason
  }
}

export function createDesktopPttBindingPayload(pttConfig = {}) {
  const mode = pttConfig?.mode === 'ptt' || pttConfig?.mode === 'vad' ? pttConfig.mode : 'live'
  const keyCode = typeof pttConfig?.pttKey === 'string' && pttConfig.pttKey.trim()
    ? pttConfig.pttKey.trim()
    : null

  return {
    mode,
    keyCode: mode === 'ptt' ? keyCode : null,
    allowPassThrough: true,
    platformStrategy: 'auto'
  }
}

export function shouldUseDesktopPttEventBinding(status) {
  const normalized = normalizeDesktopPttBindingStatus(status)
  return normalized.mode === 'global-raw-input'
    || normalized.mode === 'global-native'
    || normalized.mode === 'global-shortcut'
}

export function resolveDesktopPttAccelerator(keyCode) {
  if (typeof keyCode !== 'string') return null
  const trimmed = keyCode.trim()
  if (!trimmed) return null

  if (DIRECT_CODE_MAPPINGS[trimmed]) {
    return DIRECT_CODE_MAPPINGS[trimmed]
  }

  if (/^Key[A-Z]$/i.test(trimmed)) {
    return trimmed.slice(3).toUpperCase()
  }

  if (/^Digit[0-9]$/.test(trimmed)) {
    return trimmed.slice(5)
  }

  if (/^F[1-9][0-9]?$/.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  return null
}
