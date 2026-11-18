import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import VoiceSettingsContent from '../../src/components/VoiceSettingsContent.vue'
import { componentContext } from '../helpers/mount-component.js'
import { useVoiceStore } from '../../src/stores/index.js'
import { browserPttHelperState, enableBrowserPttHelper, disableBrowserPttHelper, retryBrowserPttHelper } from '../../src/lib/browser-ptt-helper-bridge.js'
import { nativePttState } from '../../src/lib/native-ptt-state.js'
import { PTT_HELPER_RELEASE_URL } from '../../src/lib/ptt-helper-platform.js'

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

it('renders the Mac beta download and permissions guide and preserves explicit opt-in', async () => {
  wrapper = context.mount(VoiceSettingsContent)
  await flushPromises()
  expect(wrapper.get('[data-testid=ptt-helper-download]').text()).toContain('Beta')
  expect(wrapper.get('[data-testid=ptt-helper-download]').attributes('href')).toBe(PTT_HELPER_RELEASE_URL)
  expect(wrapper.get('[data-testid=ptt-helper-guide]').text()).toContain('macOS permissions')
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
