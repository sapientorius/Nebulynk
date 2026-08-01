import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ScreenShareControls', () => {
  it('owns prefixed start, active, and stop controls for screen-share headers', () => {
    const source = readFileSync(resolve('src/components/ScreenShareControls.vue'), 'utf8')

    expect(source).toContain("name: 'ScreenShareControls'")
    expect(source).toContain("return `${this.testIdPrefix}-${suffix}`")
    expect(source).toContain("testId('share-trigger-idle')")
    expect(source).toContain("testId('screen-share-quality-select')")
    expect(source).toContain("testId('start-screen-share')")
    expect(source).toContain("testId('share-trigger-active')")
    expect(source).toContain("testId('stop-screen-share-header')")
  })

  it('keeps screen-share side effects in the existing stores', () => {
    const source = readFileSync(resolve('src/components/ScreenShareControls.vue'), 'utf8')

    expect(source).toContain('useVoiceStore()')
    expect(source).toContain('useUiStore()')
    expect(source).toContain('pickFeaturedScreenShare(this.channelShares, this.voiceStore.pinnedShareParticipantId)')
    expect(source).toContain('this.voiceStore.startScreenShare({')
    expect(source).toContain('qualityProfile: this.voiceStore.screenSharePublishQuality')
    expect(source).toContain('this.voiceStore.stopScreenShare()')
    expect(source).toContain('this.uiStore.openScreenSharePanel()')
    expect(source).toContain('this.uiStore.resetScreenShareVisibility()')
  })
})
