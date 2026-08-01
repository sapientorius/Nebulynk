import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ChannelPastMeetingsPanel', () => {
  it('loads past meetings in 4-item windows and reuses the shared meeting summary card', () => {
    const source = readFileSync(resolve('src/components/ChannelPastMeetingsPanel.vue'), 'utf8')

    expect(source).toContain("visibleCount: 4")
    expect(source).toContain("pageSize: 4")
    expect(source).toContain("detail: 'full'")
    expect(source).toContain("timeBucket: 'past'")
    expect(source).toContain('const requestedLimit = this.visibleCount + 1')
    expect(source).toContain('this.canLoadMore = meetings.length > this.visibleCount')
    expect(source).toContain('meetings.slice(0, this.visibleCount)')
    expect(source).toContain('this.visibleCount += this.pageSize')
    expect(source).toContain("import MeetingActionCard from './MeetingActionCard.vue'")
    expect(source).toContain("import { buildMeetingCardState, resolveMeetingMiniSummary } from '../lib/meeting-card.js'")
    expect(source).toContain('variant="overview"')
    expect(source).toContain(':show-label="false"')
    expect(source).toContain('...buildMeetingCardState({')
    expect(source).toContain('miniSummary: resolveMeetingMiniSummary(meeting)')
    expect(source).toContain('data-testid="channel-past-meetings-load-more"')
  })
})
