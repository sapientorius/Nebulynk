import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingSummaryPanel', () => {
  it('owns summary rendering, stable test IDs, and parent-emitted actions', () => {
    const source = readFileSync(resolve('src/components/MeetingSummaryPanel.vue'), 'utf8')

    expect(source).toContain("name: 'MeetingSummaryPanel'")
    expect(source).toContain('data-testid="meeting-summary-panel"')
    expect(source).toContain('data-testid="meeting-summary-coverage-badge"')
    expect(source).toContain('data-testid="meeting-summary-share-trigger"')
    expect(source).toContain('data-testid="meeting-summary-share-menu"')
    expect(source).toContain('data-testid="meeting-summary-share-copy"')
    expect(source).toContain('data-testid="meeting-summary-share-export"')
    expect(source).toContain('data-testid="meeting-summary-share-in-app"')
    expect(source).toContain('data-testid="meeting-summary-generate"')
    expect(source).toContain('data-testid="meeting-summary-decision"')
    expect(source).toContain('data-testid="meeting-summary-open-item"')
    expect(source).toContain('data-testid="meeting-summary-topic"')
    expect(source).toContain('data-testid="meeting-summary-error"')
    expect(source).toContain('data-testid="meeting-summary-generation-hint"')
    expect(source).toContain("emits: ['generate-summary', 'copy-summary', 'export-summary', 'share-summary', 'open-evidence']")
  })

  it('groups share actions into a share menu and lets the parent hide in-app sharing', () => {
    const source = readFileSync(resolve('src/components/MeetingSummaryPanel.vue'), 'utf8')

    expect(source).toContain('canShareInApp')
    expect(source).toContain('compactHeader')
    expect(source).toContain("v-if=\"!compactHeader\"")
    expect(source).toContain('data-testid="meeting-summary-compact-actions"')
    expect(source).toContain('showShareMenuTrigger()')
    expect(source).toContain('showShareMenu: false')
    expect(source).toContain('data-testid="meeting-summary-share-trigger"')
    expect(source).toContain("{{ $t('ui.views.share') }}")
    expect(source).toContain('data-testid="meeting-summary-share-menu"')
    expect(source).toContain('v-if="canShareInApp"')
    expect(source).toContain('data-testid="meeting-summary-share-in-app"')
    expect(source).toContain(':disabled="!summaryShareText"')
    expect(source).toContain('data-testid="meeting-summary-share-copy"')
    expect(source).toContain('data-testid="meeting-summary-share-export"')
    expect(source).not.toContain('data-testid="meeting-summary-copy"')
    expect(source).not.toContain('data-testid="meeting-summary-export"')
    expect(source).not.toContain('data-testid="meeting-summary-share"')
    expect(source).toContain("emitShareAction('copy-summary')")
    expect(source).toContain("emitShareAction('export-summary')")
    expect(source).toContain("emitShareAction('share-summary')")
  })

  it('keeps summary generation and degraded coverage state inside the panel', () => {
    const source = readFileSync(resolve('src/components/MeetingSummaryPanel.vue'), 'utf8')

    expect(source).toContain('summaryGenerationAction()')
    expect(source).toContain('showSummaryGenerationButton()')
    expect(source).toContain('summaryGenerationButtonLabel()')
    expect(source).toContain("this.summaryGeneration?.reason === 'missing_runtime'")
    expect(source).toContain("this.summaryGeneration?.reason === 'retry_forbidden'")
    expect(source).toContain('summaryChatMessageCount()')
    expect(source).toContain('summaryChatAuthorCount()')
    expect(source).toContain('this.loadedMeetingChatMessages.length')
    expect(source).toContain('summaryCoverageDetailText()')
    expect(source).toContain('ui.views.coverage_sources_chat_only')
    expect(source).toContain('ui.views.coverage_sources_partial')
    expect(source).toContain('ui.views.generate_summary')
    expect(source).toContain('ui.views.retry_summary')
  })

  it('uses shared artifact formatting for evidence links and transcript chapter jumps', () => {
    const source = readFileSync(resolve('src/components/MeetingSummaryPanel.vue'), 'utf8')

    expect(source).toContain("import { formatEvidenceLabel, formatTranscriptTimestamp } from '../lib/meeting-artifact-format.js'")
    expect(source).toContain('formatTranscriptTimestamp(chapter.start_ms)')
    expect(source).toContain("formatEvidenceLabel(evidence, this.$t)")
    expect(source).toContain("@click=\"$emit('open-evidence', evidence)\"")
  })
})
