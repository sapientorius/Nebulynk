import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageSummaryCard', () => {
  it('renders private AI timeline artifacts without normal message actions', () => {
    const source = readFileSync(resolve('src/components/MessageSummaryCard.vue'), 'utf8')

    expect(source).toContain("name: 'MessageSummaryCard'")
    expect(source).toContain('data-testid="message-summary-card"')
    expect(source).toContain("{{ $t('ui.components.private') }}")
    expect(source).toContain("summary.status === 'processing'")
    expect(source).toContain("summary.status === 'failed'")
    expect(source).toContain('summary_source_count')
    expect(source).toContain('data-testid="message-summary-delete"')
    expect(source).toContain("emits: ['remove']")
    expect(source).toContain('summaryTimeLabel')
    expect(source).toContain('formatSummaryTimeLabel')
    expect(source).toContain("formatSummaryTimeLabel(this.summary, { locale: getCurrentLocale() })")
  })
})
