import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingActionCard', () => {
  it('clamps the mini summary to two lines and exposes the full text on hover or click', () => {
    const source = readFileSync(resolve('src/components/MeetingActionCard.vue'), 'utf8')

    expect(source).toContain('meeting-card-mini-summary')
    expect(source).toContain(':title="miniSummary"')
    expect(source).toContain('<n-popover v-if="miniSummary" trigger="click" placement="top-start">')
    expect(source).toContain('@click.stop')
    expect(source).toContain('@keydown.enter.stop.prevent="$event.currentTarget.click()"')
    expect(source).toContain('@keydown.space.stop.prevent="$event.currentTarget.click()"')
    expect(source).toContain('-webkit-line-clamp: 2;')
    expect(source).toContain('meeting-card-mini-summary-popover')
  })

  it('hides actions and styles cards whose meeting contents are restricted', () => {
    const source = readFileSync(resolve('src/components/MeetingActionCard.vue'), 'utf8')
    expect(source).toContain("'meeting-card-restricted': isAccessDenied")
    expect(source).toContain('v-if="!isAccessDenied"')
    expect(source).toContain("isAccessDenied: {")
  })

  it('supports an overview variant that expands cards to the grid width', () => {
    const source = readFileSync(resolve('src/components/MeetingActionCard.vue'), 'utf8')

    expect(source).toContain("'meeting-card-overview': variant === 'overview'")
    expect(source).toContain('.meeting-card-overview {')
    expect(source).toContain('max-width: none;')
    expect(source).toContain('height: 100%;')
  })
})
