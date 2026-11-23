import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import VoiceSettingsContent from '../../src/components/VoiceSettingsContent.vue'
import { componentContext } from '../helpers/mount-component.js'
import { useVoiceStore } from '../../src/stores/index.js'
import { browserPttHelperState, enableBrowserPttHelper, disableBrowserPttHelper, retryBrowserPttHelper } from '../../src/lib/browser-ptt-helper-bridge.js'
import { getPttKey, setPttKey } from '../../src/lib/mic-activation.js'
import { nativePttState } from '../../src/lib/native-ptt-state.js'
import { PTT_HELPER_GUIDE_URL, PTT_HELPER_RELEASE_URL } from '../../src/lib/ptt-helper-platform.js'

vi.mock('../../src/lib/browser-ptt-helper-bridge.js', () => ({
  browserPttHelperState: reactive({ available: true, enabled: false, platform: 'macos' }),
  enableBrowserPttHelper: vi.fn(), disableBrowserPttHelper: vi.fn(), retryBrowserPttHelper: vi.fn()
}))
vi.mock('../../src/lib/livekit.js', async original => ({ ...await original(),
  getAudioInputDevices: vi.fn(async () => []), getAudioOutputDevices: vi.fn(async () => [])
}))

let wrapper, context
beforeEach(async () => {
  context = await componentContext()
  useVoiceStore().micMode = 'ptt'
  Object.assign(browserPttHelperState, { available: true, enabled: false, platform: 'macos' })
  Object.assign(nativePttState, { transport: 'browser-helper', helperState: 'idle', authorized: false, isTarget: false,
    bindingStatus: { mode: 'focused-only', platform: 'macos', reason: null } })
  vi.clearAllMocks()
})
afterEach(() => wrapper?.unmount())

it('renders the Mac download and permissions guide and preserves explicit opt-in', async () => {
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.get('[data-testid=ptt-helper-download]').text()).toBe('Download macOS PTT Helper')
  expect(wrapper.get('[data-testid=ptt-helper-download]').attributes('href')).toBe(PTT_HELPER_RELEASE_URL)
  expect(wrapper.get('[data-testid=ptt-helper-guide]').text()).toContain('macOS permissions')
  expect(wrapper.get('[data-testid=ptt-helper-guide]').attributes('href')).toBe(PTT_HELPER_GUIDE_URL)
  expect(wrapper.text()).toContain('not notarized by Apple')
  expect(wrapper.text()).toContain('Input Monitoring')
  expect(enableBrowserPttHelper).not.toHaveBeenCalled()
  const enable = wrapper.findAll('button').find(button => button.text() === 'Enable global Push-to-Talk')
  await enable.trigger('click')
  expect(enableBrowserPttHelper).toHaveBeenCalledOnce()
  browserPttHelperState.enabled = true
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === 'Disable global Push-to-Talk').trigger('click')
  expect(disableBrowserPttHelper).toHaveBeenCalledOnce()
})

it('keeps Windows downloads separate and hides the helper on unsupported platforms', async () => {
  browserPttHelperState.platform = 'windows'
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.get('[data-testid=ptt-helper-download]').text()).toBe('Download the Windows PTT Helper')
  expect(wrapper.find('[data-testid=ptt-helper-guide]').exists()).toBe(false)
  browserPttHelperState.available = false
  await flushPromises()
  expect(wrapper.find('[data-testid=ptt-helper-download]').exists()).toBe(false)
})

it('explains permission loss instead of claiming that native capture is active', async () => {
  nativePttState.bindingStatus = { mode: 'unsupported', platform: 'macos', isGlobal: false, reason: 'macos-input-monitoring-required' }
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.text()).toContain('macOS PTT needs attention')
  expect(wrapper.text()).toContain('Input Monitoring')
})

it.each(['binding-approval-required', 'binding-rejected'])('explains local key decisions: %s', async reason => {
  nativePttState.helperState = reason
  nativePttState.bindingStatus = { mode: 'focused-only', isGlobal: false, reason }
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.text()).toContain('Key approval required')
  expect(wrapper.text()).toContain(reason === 'binding-rejected' ? 'was rejected' : 'Confirm the selected key')
})

it('explains that an incompatible helper must be updated', async () => {
  nativePttState.helperState = 'update-required'
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.text()).toContain('Update PTT Helper')
  expect(wrapper.text()).toContain('0.4.0')
})

it.each(['pairing-mode-closed', 'pairing-expired', 'pairing-rejected', 'helper-limited', 'connection-failed'])('offers an explicit retry after %s', async helperState => {
  browserPttHelperState.enabled = true
  nativePttState.helperState = helperState
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.get('[data-testid=ptt-pairing-steps]').text()).toContain('Pair New Website')
  await wrapper.get('[data-testid=ptt-helper-retry]').trigger('click')
  expect(retryBrowserPttHelper).toHaveBeenCalledOnce()
  nativePttState.helperState = 'pairing-required'
  await flushPromises()
  expect(wrapper.find('[data-testid=ptt-helper-retry]').exists()).toBe(false)
})

describe('recording a Windows PTT key', () => {
  let recordButton

  function press(type, code, options = {}) {
    window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true, ...options }))
  }

  beforeEach(async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    setPttKey('Space')
    wrapper = context.mount(VoiceSettingsContent)
    recordButton = wrapper.get('[data-testid=ptt-key-record]')
    await recordButton.trigger('click')
  })

  afterEach(() => setPttKey('Space'))

  it('records AltRight after the synthetic left Ctrl event', async () => {
    const previousSettings = localStorage.getItem('voiceMicSettings')
    press('keydown', 'ControlLeft', { key: 'Control', ctrlKey: true })
    expect(getPttKey()).toBe('Space')
    expect(localStorage.getItem('voiceMicSettings')).toBe(previousSettings)

    press('keydown', 'AltRight', { key: 'AltGraph' })
    press('keyup', 'ControlLeft', { key: 'Control' })
    press('keyup', 'AltRight', { key: 'AltGraph' })
    await flushPromises()

    expect(getPttKey()).toBe('AltRight')
    expect(JSON.parse(localStorage.getItem('voiceMicSettings')).pttKey).toBe('AltRight')
    expect(recordButton.text()).toBe('Alt Gr / Alt rechts')
  })

  it('records left Ctrl on release and ignores auto-repeat', () => {
    press('keydown', 'ControlLeft')
    press('keydown', 'ControlLeft', { repeat: true })
    expect(getPttKey()).toBe('Space')

    press('keyup', 'ControlLeft')
    expect(getPttKey()).toBe('ControlLeft')
  })

  it('records a regular key on keydown', () => {
    press('keydown', 'KeyV')
    expect(getPttKey()).toBe('KeyV')
  })

  it('keeps left Ctrl as the first key when a different key follows', () => {
    press('keydown', 'ControlLeft')
    press('keydown', 'KeyV')
    expect(getPttKey()).toBe('ControlLeft')
  })

  it.each(['blur', 'timeout'])('discards pending left Ctrl on %s', async (reason) => {
    if (reason === 'timeout') {
      vi.useFakeTimers()
      await recordButton.trigger('click')
    }
    press('keydown', 'ControlLeft')

    if (reason === 'blur') window.dispatchEvent(new Event('blur'))
    else vi.advanceTimersByTime(5000)
    press('keyup', 'ControlLeft')
    expect(getPttKey()).toBe('Space')

    await recordButton.trigger('click')
    press('keydown', 'KeyV')
    expect(getPttKey()).toBe('KeyV')
  })
})
