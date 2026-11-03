import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIC_MODE_PTT,
  destroy,
  init,
  isCurrentlyTransmitting,
  setDesktopPttBindingStatus,
  setManualMute,
  setMode,
  setPttKey
} from '../../src/lib/mic-activation.js'

const { track, playSfx, voiceSession } = vi.hoisted(() => ({
  track: { mute: vi.fn(), unmute: vi.fn() },
  playSfx: vi.fn(),
  voiceSession: { connected: true }
}))

vi.mock('../../src/lib/livekit.js', () => ({
  getRoom: () => voiceSession.connected ? {
    localParticipant: { getTrackPublication: () => ({ track }) }
  } : null
}))
vi.mock('../../src/lib/sfx.js', () => ({
  playSfx,
  SFX_EVENTS: {
    VOICE_PTT_SELF_DOWN: 'ptt-down',
    VOICE_PTT_SELF_UP: 'ptt-up'
  }
}))
vi.mock('../../src/lib/runtime.js', () => ({ isDesktopWorkspaceWindow: () => false }))

function keyEvent(target, type, code = 'Space', options = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(event)
  return event
}

function focusField(tag = 'textarea') {
  const field = document.createElement(tag)
  if (tag === 'div') field.setAttribute('contenteditable', 'true')
  document.body.append(field)
  field.focus()
  expect(document.activeElement).toBe(field)
  return field
}

describe('local push-to-talk with focused text fields', () => {
  let onTransmitChange

  beforeEach(() => {
    voiceSession.connected = true
    onTransmitChange = vi.fn()
    init({ onTransmitChange })
    setPttKey('Space')
    setMode(MIC_MODE_PTT)
    vi.clearAllMocks()
  })

  afterEach(() => destroy())

  it.each(['textarea', 'input', 'div'])('transmits while the PTT key is held in a focused %s', (tag) => {
    const field = focusField(tag)

    expect(keyEvent(field, 'keydown').defaultPrevented).toBe(false)
    expect(isCurrentlyTransmitting()).toBe(true)
    expect(track.unmute).toHaveBeenCalledOnce()
    expect(onTransmitChange).toHaveBeenLastCalledWith(true)
    expect(playSfx).toHaveBeenLastCalledWith('ptt-down')

    expect(keyEvent(field, 'keyup').defaultPrevented).toBe(false)
    expect(isCurrentlyTransmitting()).toBe(false)
    expect(track.mute).toHaveBeenCalledOnce()
    expect(onTransmitChange).toHaveBeenLastCalledWith(false)
    expect(playSfx).toHaveBeenLastCalledWith('ptt-up')
  })

  it('allows normal field actions while observing PTT before the field stops propagation', () => {
    setPttKey('Enter')
    const field = focusField()
    const fieldHandler = vi.fn((event) => {
      expect(isCurrentlyTransmitting()).toBe(event.type === 'keydown')
      event.stopPropagation()
    })
    field.addEventListener('keydown', fieldHandler)
    field.addEventListener('keyup', fieldHandler)

    keyEvent(field, 'keydown', 'Enter', { key: 'Enter' })
    expect(isCurrentlyTransmitting()).toBe(true)
    keyEvent(field, 'keyup', 'Enter', { key: 'Enter' })
    expect(isCurrentlyTransmitting()).toBe(false)
    expect(fieldHandler).toHaveBeenCalledTimes(2)
  })

  it.each([
    { code: 'ShiftLeft', key: 'Shift', shiftKey: true },
    { code: 'KeyV', key: 'v', shiftKey: false }
  ])('preserves normal keyboard events for $code while activating PTT', ({ code, key, shiftKey }) => {
    setPttKey(code)
    const field = focusField()
    const fieldHandler = vi.fn()
    field.addEventListener('keydown', fieldHandler)
    field.addEventListener('keyup', fieldHandler)

    const down = keyEvent(field, 'keydown', code, { key, shiftKey })
    expect(down.defaultPrevented).toBe(false)
    expect(fieldHandler).toHaveBeenLastCalledWith(down)
    expect(down.shiftKey).toBe(shiftKey)
    expect(isCurrentlyTransmitting()).toBe(true)

    const up = keyEvent(field, 'keyup', code, { key })
    expect(up.defaultPrevented).toBe(false)
    expect(fieldHandler).toHaveBeenLastCalledWith(up)
    expect(isCurrentlyTransmitting()).toBe(false)
  })

  it('passes auto-repeat to the field without replaying the activation sound', () => {
    const field = focusField()
    const fieldHandler = vi.fn()
    field.addEventListener('keydown', fieldHandler)
    keyEvent(field, 'keydown')

    expect(keyEvent(field, 'keydown', 'Space', { repeat: true }).defaultPrevented).toBe(false)
    expect(fieldHandler).toHaveBeenCalledTimes(2)
    expect(isCurrentlyTransmitting()).toBe(true)
    expect(track.unmute).toHaveBeenCalledOnce()
    expect(playSfx).toHaveBeenCalledExactlyOnceWith('ptt-down')
  })

  it('leaves other typing keys available', () => {
    const field = focusField()
    const inputHandler = vi.fn()
    field.addEventListener('keydown', inputHandler)

    expect(keyEvent(field, 'keydown', 'KeyA').defaultPrevented).toBe(false)
    expect(inputHandler).toHaveBeenCalledOnce()
    expect(isCurrentlyTransmitting()).toBe(false)
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('releases the microphone after focus moves to another text field', () => {
    keyEvent(focusField(), 'keydown')
    keyEvent(focusField('input'), 'keyup')

    expect(isCurrentlyTransmitting()).toBe(false)
    expect(track.mute).toHaveBeenCalledOnce()
  })

  it('mutes on window blur and ignores a later unmatched key release', () => {
    const field = focusField()
    keyEvent(field, 'keydown')
    window.dispatchEvent(new Event('blur'))

    expect(isCurrentlyTransmitting()).toBe(false)
    expect(track.mute).toHaveBeenCalledOnce()
    expect(keyEvent(field, 'keyup').defaultPrevented).toBe(false)
    expect(playSfx.mock.calls).toEqual([['ptt-down'], ['ptt-up']])
  })

  it.each(['manual mute', 'no voice session', 'native binding'])('ignores local keys with %s', (condition) => {
    if (condition === 'manual mute') setManualMute(true)
    if (condition === 'no voice session') voiceSession.connected = false
    if (condition === 'native binding') {
      setDesktopPttBindingStatus({ mode: 'global-raw-input', isGlobal: true, usesRawInput: true })
    }
    const field = focusField()

    expect(keyEvent(field, 'keydown').defaultPrevented).toBe(false)
    expect(keyEvent(field, 'keyup').defaultPrevented).toBe(false)
    expect(isCurrentlyTransmitting()).toBe(false)
    expect(track.unmute).not.toHaveBeenCalled()
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('lets the settings key recorder intercept the shortcut first', () => {
    const recordKey = (event) => {
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', recordKey, { capture: true, once: true })

    keyEvent(focusField(), 'keydown')

    expect(isCurrentlyTransmitting()).toBe(false)
    expect(track.unmute).not.toHaveBeenCalled()
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('removes its keyboard listeners when the voice session ends', () => {
    destroy()
    const field = focusField()

    expect(keyEvent(field, 'keydown').defaultPrevented).toBe(false)
    expect(keyEvent(field, 'keyup').defaultPrevented).toBe(false)
    expect(track.unmute).not.toHaveBeenCalled()
    expect(playSfx).not.toHaveBeenCalled()
  })
})
