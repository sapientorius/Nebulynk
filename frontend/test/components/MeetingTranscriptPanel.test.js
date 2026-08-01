import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MeetingTranscriptPanel', () => {
  it('owns transcript rendering, retry controls, and stable test IDs', () => {
    const source = readFileSync(resolve('src/components/MeetingTranscriptPanel.vue'), 'utf8')

    expect(source).toContain("name: 'MeetingTranscriptPanel'")
    expect(source).toContain('data-testid="meeting-transcript-panel"')
    expect(source).toContain('data-testid="meeting-transcript-text"')
    expect(source).toContain('data-testid="meeting-transcript-error"')
    expect(source).toContain('data-testid="meeting-transcript-generate"')
    expect(source).toContain('data-testid="meeting-transcript-generation-hint"')
    expect(source).toContain('data-testid="meeting-transcript-warning"')
    expect(source).toContain('ui.views.transcript_warnings')
    expect(source).toContain("emits: ['generate-transcript', 'open-evidence']")
  })

  it('keeps transcript generation hints and partial-completeness rendering in the panel', () => {
    const source = readFileSync(resolve('src/components/MeetingTranscriptPanel.vue'), 'utf8')

    expect(source).toContain('compactHeader')
    expect(source).toContain("v-if=\"!compactHeader\"")
    expect(source).toContain('data-testid="meeting-transcript-compact-actions"')
    expect(source).toContain('showTranscriptGenerationButton()')
    expect(source).toContain('transcriptGenerationButtonLabel()')
    expect(source).toContain("this.transcriptGeneration?.reason === 'missing_runtime'")
    expect(source).toContain("this.transcriptGeneration?.reason === 'retry_forbidden'")
    expect(source).toContain("this.transcriptGeneration?.reason === 'no_retryable_recordings'")
    expect(source).toContain('transcriptCompletenessType(completeness)')
    expect(source).toContain('ui.views.retry_transcript')
    expect(source).toContain('ui.views.transcript_completeness_partial')
  })

  it('handles highlighted transcript segments and exposes a scroll helper for the view', () => {
    const source = readFileSync(resolve('src/components/MeetingTranscriptPanel.vue'), 'utf8')

    expect(source).toContain('highlightedStartMs')
    expect(source).toContain('highlightedTranscriptSegment()')
    expect(source).toContain('transcript-segment-highlighted')
    expect(source).toContain('scrollHighlightedIntoView()')
    expect(source).toContain('element?.scrollIntoView?.')
    expect(source).toContain("import { formatTranscriptTimestamp } from '../lib/meeting-artifact-format.js'")
  })
})
