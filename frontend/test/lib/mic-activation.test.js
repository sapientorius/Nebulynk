import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MIC_MODE_PTT,
  destroy,
  getDesktopPttBindingStatus,
  init,
  isCurrentlyTransmitting,
  saveSettings,
  setDesktopPttBindingStatus,
  setMode,
  triggerExternalPttDown,
  triggerExternalPttUp
} from '../../src/lib/mic-activation.js'
import { desktopWindowState } from '../../src/lib/desktop-window-state.js'

const playSfxMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/sfx.js', () => ({
  playSfx: playSfxMock,
  SFX_EVENTS: {
    VOICE_PTT_SELF_DOWN: 'voice_ptt_self_down',
    VOICE_PTT_SELF_UP: 'voice_ptt_self_up'
  }
}))

const runtimeState = vi.hoisted(() => ({
  desktopWorkspace: false
}))

const micTrackMock = vi.hoisted(() => ({
  mute: vi.fn(),
  unmute: vi.fn(),
  mediaStreamTrack: null
}))

vi.mock('../../src/lib/livekit.js', () => ({
  getRoom: () => ({
    localParticipant: {
      getTrackPublication: () => ({
        track: micTrackMock
      })
    }
  })
}))

vi.mock('../../src/lib/runtime.js', async () => {
  const actual = await vi.importActual('../../src/lib/runtime.js')
  return {
    ...actual,
    isDesktopWorkspaceWindow: () => runtimeState.desktopWorkspace
  }
})

describe('external push-to-talk bridge', () => {
  let listeners

  beforeEach(() => {
    runtimeState.desktopWorkspace = false
    micTrackMock.mute.mockReset()
    micTrackMock.unmute.mockReset()
    playSfxMock.mockReset()
    listeners = new Map()
    globalThis.window = {
      location: {
        pathname: '/'
      },
      addEventListener(type, handler) {
        listeners.set(type, handler)
      },
      removeEventListener(type) {
        listeners.delete(type)
      }
    }
    globalThis.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
    desktopWindowState.isFocused = true
  })

  afterEach(() => {
    destroy()
  })

  it('toggles transmit state from desktop events while in push-to-talk mode', () => {
    init()
    setMode(MIC_MODE_PTT)

    triggerExternalPttDown()
    expect(isCurrentlyTransmitting()).toBe(true)

    triggerExternalPttUp()
    expect(isCurrentlyTransmitting()).toBe(false)
  })

  it('plays push-to-talk sounds for external desktop events while the app is unfocused', () => {
    init()
    setMode(MIC_MODE_PTT)
    desktopWindowState.isFocused = false

    triggerExternalPttDown()
    triggerExternalPttUp()

    expect(playSfxMock).toHaveBeenNthCalledWith(1, 'voice_ptt_self_down')
    expect(playSfxMock).toHaveBeenNthCalledWith(2, 'voice_ptt_self_up')
  })

  it('suppresses focused-window keyboard ptt when desktop-global binding is active', () => {
    init()
    setMode(MIC_MODE_PTT)
    setDesktopPttBindingStatus({
      mode: 'global-raw-input',
      isGlobal: true,
      usesRawInput: true,
      allowPassThrough: true,
      platform: 'windows'
    })

    listeners.get('keydown')?.({
      code: 'Space',
      repeat: false,
      target: {
        tagName: 'DIV',
        isContentEditable: false
      },
      preventDefault() {}
    })

    expect(isCurrentlyTransmitting()).toBe(false)
    expect(getDesktopPttBindingStatus().mode).toBe('global-raw-input')
  })

  it('does not persist mic settings to browser localStorage inside desktop workspace windows', () => {
    runtimeState.desktopWorkspace = true

    init()
    setMode(MIC_MODE_PTT)
    saveSettings()

    expect(globalThis.localStorage.setItem).not.toHaveBeenCalled()
  })
})
