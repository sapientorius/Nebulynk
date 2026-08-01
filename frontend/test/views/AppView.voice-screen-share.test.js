import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AppView voice screen share integration', () => {
  it('shows voice-channel screen share controls and a shared panel context', () => {
    const source = readFileSync(resolve('src/views/AppView.vue'), 'utf8')
    const controlsSource = readFileSync(resolve('src/components/ScreenShareControls.vue'), 'utf8')

    expect(source).toContain('data-testid="voice-screen-share-toolbar"')
    expect(source).toContain('<ScreenShareControls')
    expect(source).toContain('test-id-prefix="voice"')
    expect(source).toContain(':channel-id="activeVoiceChannel?.id || null"')
    expect(source).toContain('return this.shareAvailable')
    expect(controlsSource).toContain("testId('share-trigger-idle')")
    expect(controlsSource).toContain("testId('screen-share-quality-select')")
    expect(controlsSource).toContain("testId('start-screen-share')")
    expect(controlsSource).toContain('this.uiStore.openScreenSharePanel()')
  })

  it('supports hidden and maximized voice share views without replacing normal chat by default', () => {
    const source = readFileSync(resolve('src/views/AppView.vue'), 'utf8')
    const overlaySource = readFileSync(resolve('src/components/ScreenShareChatOverlay.vue'), 'utf8')
    const controlsSource = readFileSync(resolve('src/components/ScreenShareControls.vue'), 'utf8')

    expect(source).toContain('<ScreenShareChatOverlay')
    expect(source).toContain('test-id-prefix="voice"')
    expect(controlsSource).toContain("testId('share-trigger-active')")
    expect(overlaySource).toContain("testId('show-screen-share-chat-peek')")
    expect(overlaySource).toContain("testId('screen-share-chat-overlay')")
    expect(source).toContain("return this.shareAvailable && this.uiStore.maximizeScreenShare")
    expect(source).toContain("v-if=\"!shareMaximized\" class=\"content-area\"")
    expect(source).toContain("type: 'channel'")
    expect(source).toContain('openDetachedScreenShareWindow({')
  })
})
