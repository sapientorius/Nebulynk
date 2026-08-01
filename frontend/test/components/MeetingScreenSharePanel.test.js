import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingScreenSharePanel', () => {
  it('supports reusable test-id prefixes for meeting and voice share contexts', () => {
    const source = readFileSync(resolve('src/components/MeetingScreenSharePanel.vue'), 'utf8')

    expect(source).toContain("testIdPrefix: {")
    expect(source).toContain("return `${this.testIdPrefix}-${suffix}`")
    expect(source).toContain(":data-testid=\"testId('hide-screen-share-panel')\"")
    expect(source).toContain(":data-testid=\"shareChatOpen ? testId('hide-screen-share-chat') : testId('show-screen-share-chat')\"")
    expect(source).toContain(":data-testid=\"maximized ? testId('restore-screen-share') : testId('maximize-screen-share')\"")
  })

  it('accepts a generic channel context and compact viewer quality controls', () => {
    const source = readFileSync(resolve('src/components/MeetingScreenSharePanel.vue'), 'utf8')

    expect(source).toContain('channelId: {')
    expect(source).toContain('shareAvailable: {')
    expect(source).toContain('emptyStateMessage: {')
    expect(source).toContain('shareChannelId()')
    expect(source).toContain('channelShares()')
    expect(source).toContain("screen-share-quality-popover")
    expect(source).toContain("testId('screen-share-quality-trigger')")
    expect(source).toContain("testId('screen-share-view-quality')")
    expect(source).not.toContain('meeting-screen-share-publish-quality')
  })
})
