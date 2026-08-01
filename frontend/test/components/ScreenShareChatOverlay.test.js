import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ScreenShareChatOverlay', () => {
  it('owns the reusable maximized screen-share chat shell with prefixed test IDs', () => {
    const source = readFileSync(resolve('src/components/ScreenShareChatOverlay.vue'), 'utf8')

    expect(source).toContain("name: 'ScreenShareChatOverlay'")
    expect(source).toContain("emits: ['toggle-chat']")
    expect(source).toContain("return `${this.testIdPrefix}-${suffix}`")
    expect(source).toContain("testId('show-screen-share-chat-peek')")
    expect(source).toContain("testId('screen-share-chat-overlay')")
    expect(source).toContain("testId('hide-screen-share-chat-overlay')")
    expect(source).toContain('<slot />')
  })

  it('keeps the previous overlay sizing and mobile adjustment in one place', () => {
    const source = readFileSync(resolve('src/components/ScreenShareChatOverlay.vue'), 'utf8')

    expect(source).toContain('height: min(50vh, 420px);')
    expect(source).toContain('height: min(50vh, 360px);')
    expect(source).toContain('@media (max-width: 900px)')
  })
})
