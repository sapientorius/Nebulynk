import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDesktopWindowState, updateDesktopWindowState } from '../../src/lib/desktop-window-state.js'

const zzfxMock = vi.hoisted(() => vi.fn())
const zzfxState = vi.hoisted(() => ({ volume: 0 }))
const originalWindow = globalThis.window
const originalDocument = globalThis.document

vi.mock('zzfx', () => ({
  zzfx: zzfxMock,
  ZZFX: zzfxState
}))

describe('notification sfx background gating', () => {
  it('resumes audio on normal gestures and removes its activation listeners', async () => {
    const { initializeSfxAudio, prepareSfxAudio } = await import('../../src/lib/sfx.js')
    const target = new EventTarget()
    const context = { state: 'suspended', resume: vi.fn(async () => { context.state = 'running' }) }
    zzfxState.audioContext = context
    const stop = initializeSfxAudio(target)
    target.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    expect(context.state).toBe('running')
    context.state = 'suspended'
    target.dispatchEvent(new Event('keydown'))
    await Promise.resolve()
    expect(context.resume).toHaveBeenCalledTimes(2)
    stop()
    context.state = 'suspended'
    target.dispatchEvent(new Event('pointerdown'))
    expect(context.resume).toHaveBeenCalledTimes(2)
    context.resume.mockRejectedValueOnce(new Error('autoplay blocked'))
    expect(await prepareSfxAudio()).toBe(false)
    delete zzfxState.audioContext
  })
  beforeEach(() => {
    zzfxMock.mockReset()
    resetDesktopWindowState()
    globalThis.window = globalThis.window || {}
    globalThis.document = globalThis.document || {}
    Object.defineProperty(globalThis.document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    })
  })

  afterEach(() => {
    resetDesktopWindowState()
    if (globalThis.window && Object.prototype.hasOwnProperty.call(globalThis.window, '__TAURI_INTERNALS__')) {
      delete globalThis.window.__TAURI_INTERNALS__
    }
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  })

  it('plays notification audio when the browser document is hidden', async () => {
    Object.defineProperty(globalThis.document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    })

    const { playSfx, SFX_EVENTS } = await import('../../src/lib/sfx.js')
    expect(playSfx(SFX_EVENTS.NOTIFICATION)).toBe(true)
    expect(zzfxMock).toHaveBeenCalledTimes(1)
  })

  it('plays notification audio for desktop background states and stays muted in the desktop foreground', async () => {
    globalThis.window.__TAURI_INTERNALS__ = {}

    updateDesktopWindowState({
      isVisible: true,
      isFocused: true,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-05-19T12:00:00.000Z'
    })

    const { playSfx, SFX_EVENTS } = await import('../../src/lib/sfx.js')
    expect(playSfx(SFX_EVENTS.NOTIFICATION)).toBe(false)

    updateDesktopWindowState({
      isVisible: true,
      isFocused: false,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-05-19T12:00:01.000Z'
    })

    expect(playSfx(SFX_EVENTS.NOTIFICATION, {
      throttleKey: 'desktop-background-1'
    })).toBe(false)

    updateDesktopWindowState({
      isVisible: true,
      isFocused: false,
      isHidden: false,
      isMinimized: false,
      isOccluded: true,
      updatedAt: '2026-05-19T12:00:02.000Z'
    })

    expect(playSfx(SFX_EVENTS.NOTIFICATION, {
      throttleKey: 'desktop-background-2'
    })).toBe(true)

    updateDesktopWindowState({
      isVisible: true,
      isFocused: false,
      isHidden: false,
      isMinimized: true,
      isOccluded: false,
      updatedAt: '2026-05-19T12:00:03.000Z'
    })

    expect(playSfx(SFX_EVENTS.NOTIFICATION, {
      throttleKey: 'desktop-background-3'
    })).toBe(true)
    expect(zzfxMock).toHaveBeenCalledTimes(2)
  })

  it('plays notification audio for desktop windows when the renderer document becomes hidden', async () => {
    globalThis.window.__TAURI_INTERNALS__ = {}
    Object.defineProperty(globalThis.document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    })

    updateDesktopWindowState({
      isVisible: true,
      isFocused: true,
      isHidden: false,
      isMinimized: false,
      isOccluded: false,
      updatedAt: '2026-05-19T12:00:04.000Z'
    })

    const { playSfx, SFX_EVENTS } = await import('../../src/lib/sfx.js')
    expect(playSfx(SFX_EVENTS.NOTIFICATION, {
      throttleKey: 'desktop-document-hidden'
    })).toBe(true)
    expect(zzfxMock).toHaveBeenCalledTimes(1)
  })
})
