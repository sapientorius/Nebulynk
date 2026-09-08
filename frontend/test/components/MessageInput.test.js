import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('static source contract: MessageInput inline image upload source contract', () => {
  it('uses a mobile bottom sheet for the composer emoji picker', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain("import { observeMobileLayout, readIsMobileLayout } from '../lib/mobile-layout.js'")
    expect(source).toContain('isMobileLayout: readIsMobileLayout()')
    expect(source).toContain('this.stopObservingMobileLayout = observeMobileLayout((matches) => {')
    expect(source).toContain('this.stopObservingMobileLayout?.()')
    expect(source).toContain('v-if="!isMobileLayout"')
    expect(source).toContain('data-testid="message-input-mobile-emoji-trigger"')
    expect(source).toContain('openMobileEmojiSheet()')
    expect(source).toContain('data-testid="message-input-mobile-emoji-sheet"')
    expect(source).toContain('data-testid="message-input-mobile-emoji-close"')
    expect(source).toContain('message-input-emoji-sheet')
    expect(source).toContain('calc(12px + env(safe-area-inset-bottom, 0px))')
    expect(source).toContain('max-height: calc(100dvh - 16px);')
  })

  it('shows the GIF button only after the Klipy configuration check succeeds', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('useGifSearchStore')
    expect(source).toContain('v-if="klipyConfigured"')
    expect(source).toContain('this.gifSearchStore.loadConfiguration().catch(() => {})')
  })
})
