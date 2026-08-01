import { describe, expect, it } from 'vitest'
import {
  createDesktopPttBindingPayload,
  isDesktopPttTextEntryKey,
  normalizeDesktopPttBindingStatus,
  resolveDesktopPttAccelerator,
  shouldUseDesktopPttEventBinding
} from '../../src/lib/desktop-ptt-shortcut.js'

describe('resolveDesktopPttAccelerator', () => {
  it('maps common letter and digit key codes to tauri accelerators', () => {
    expect(resolveDesktopPttAccelerator('KeyV')).toBe('V')
    expect(resolveDesktopPttAccelerator('Digit7')).toBe('7')
    expect(resolveDesktopPttAccelerator('F12')).toBe('F12')
  })

  it('maps direct special key codes', () => {
    expect(resolveDesktopPttAccelerator('Space')).toBe('Space')
    expect(resolveDesktopPttAccelerator('ArrowUp')).toBe('Up')
    expect(resolveDesktopPttAccelerator('NumpadAdd')).toBe('NumpadAdd')
  })

  it('returns null for unsupported or empty key codes', () => {
    expect(resolveDesktopPttAccelerator('')).toBe(null)
    expect(resolveDesktopPttAccelerator('MediaPlayPause')).toBe(null)
    expect(resolveDesktopPttAccelerator(null)).toBe(null)
  })

  it('identifies text-entry ptt keys that should avoid OS hotkey registration', () => {
    expect(isDesktopPttTextEntryKey('Space')).toBe(true)
    expect(isDesktopPttTextEntryKey('KeyV')).toBe(true)
    expect(isDesktopPttTextEntryKey('Digit7')).toBe(true)
    expect(isDesktopPttTextEntryKey('Numpad2')).toBe(true)
    expect(isDesktopPttTextEntryKey('ArrowUp')).toBe(false)
    expect(isDesktopPttTextEntryKey('F12')).toBe(false)
  })

  it('creates a structured desktop binding payload from ptt config', () => {
    expect(createDesktopPttBindingPayload({
      mode: 'ptt',
      pttKey: 'Space'
    })).toEqual({
      mode: 'ptt',
      keyCode: 'Space',
      allowPassThrough: true,
      platformStrategy: 'auto'
    })
  })

  it('normalizes desktop binding status and reports when desktop events should drive ptt', () => {
    const status = normalizeDesktopPttBindingStatus({
      mode: 'global-raw-input',
      keyCode: 'Space',
      isGlobal: true,
      usesRawInput: true,
      allowPassThrough: true,
      platform: 'windows'
    })

    expect(status.mode).toBe('global-raw-input')
    expect(status.usesRawInput).toBe(true)
    expect(shouldUseDesktopPttEventBinding(status)).toBe(true)
    expect(shouldUseDesktopPttEventBinding({ mode: 'global-native' })).toBe(true)
    expect(shouldUseDesktopPttEventBinding({ mode: 'focused-only' })).toBe(false)
  })
})
