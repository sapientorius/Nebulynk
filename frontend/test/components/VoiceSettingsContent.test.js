import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VoiceSettingsContent', () => {
  it('shows opt-in global PTT guidance only for Windows browser helper candidates', () => {
    const source = readFileSync(resolve('src/components/VoiceSettingsContent.vue'), 'utf8')

    expect(source).toContain("desktop_ptt_passthrough_hint")
    expect(source).toContain("desktop_ptt_focused_only_hint")
    expect(source).toContain("desktop_ptt_recommend_non_text_key")
    expect(source).toContain("this.nativePttHelperState === 'pairing-required'")
    expect(source).toContain("this.nativePttHelperState === 'unavailable'")
    expect(source).toContain("this.nativePttHelperState === 'paused'")
    expect(source).toContain("this.nativePttTransport === 'browser-helper'")
    expect(source).toContain('nativePttState.bindingStatus')
    expect(source).toContain("this.desktopPttBindingStatus?.mode === 'global-raw-input'")
    expect(source).toContain("this.desktopPttBindingStatus?.mode === 'global-native'")
    expect(source).toContain("this.desktopPttBindingStatus?.mode === 'unsupported'")
    expect(source).toContain('isDesktopPttTextEntryKey(this.pttKeyLocal)')
    expect(source).toContain("isDesktopWorkspaceWindow() || this.nativePttTransport === 'browser-helper'")
    expect(source).toContain('v-if="showBrowserGlobalPttSettings"')
    expect(source).toContain('class="global-ptt-card"')
    expect(source).toContain('browserPttHelperState.available === true')
    expect(source).toContain('browserPttHelperState.enabled === true')
    expect(source).toContain('enableBrowserPttHelper()')
    expect(source).toContain('disableBrowserPttHelper()')
    expect(source).toContain('https://github.com/sapientorius/Nebulynk/releases')
    expect(source).toContain("$t('ui.components.global_ptt_install_helper')")
    expect(source).toContain("$t('ui.components.global_ptt_permission_explanation')")
    expect(source).toContain("$t('ui.components.global_ptt_enable')")
    expect(source).toContain("$t('ui.components.global_ptt_disable')")
    expect(source).not.toContain('syncDesktopWorkspacePttConfig')
    expect(source).not.toContain('[voice-settings:ptt-key-sync]')
  })
})
