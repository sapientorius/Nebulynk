import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VoiceSettingsContent', () => {
  it('shows desktop ptt guidance for native pass-through and focused-only fallbacks', () => {
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
    expect(source).not.toContain('syncDesktopWorkspacePttConfig')
    expect(source).not.toContain('[voice-settings:ptt-key-sync]')
  })
})
