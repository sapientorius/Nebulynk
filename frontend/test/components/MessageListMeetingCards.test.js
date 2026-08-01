import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageList meeting card hydration', () => {
  it('reloads ended referenced meetings with full detail so inline mini summaries appear on first render', () => {
    const source = readFileSync(resolve('src/components/MessageList.vue'), 'utf8')

    expect(source).toContain("const requiresFullDetail = Boolean(meeting && meeting.status === 'ended' && meeting.detail_level !== 'full')")
    expect(source).toContain("if (meeting && !requiresFullDetail) return")
    expect(source).toContain("requiresFullDetail ? { detail: 'full' } : {}")
    expect(source).toContain('this.meetingsStore.ensureMeetingLoaded(')
  })

  it('shows the reusable pulse loader only for empty initial loads and delays the content reveal', () => {
    const source = readFileSync(resolve('src/components/MessageList.vue'), 'utf8')

    expect(source).toContain("import NebulynkLoader from './NebulynkLoader.vue'")
    expect(source).toContain('v-if="showInitialLoader"')
    expect(source).toContain('<NebulynkLoader')
    expect(source).toContain('variant="pulse"')
    expect(source).toContain("return this.loading && this.timelineItems.length === 0")
    expect(source).toContain('const CONTENT_REVEAL_DELAY_MS = 50')
    expect(source).toContain('this.scheduleContentReveal()')
    expect(source).toContain("'message-list-content-revealing': isContentRevealing")
    expect(source).toContain("'message-list-content-visible': isContentVisible")
    expect(source).toContain('setTimeout(() => {')
    expect(source).toContain("transition: opacity 0.18s ease;")
  })
})
