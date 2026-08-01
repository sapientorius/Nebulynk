import { describe, expect, it } from 'vitest'
import { formatEvidenceLabel, formatTranscriptTimestamp } from '../../src/lib/meeting-artifact-format.js'

const messages = {
  'ui.views.evidence': 'Evidence',
  'ui.views.chat_evidence': 'Chat',
  'ui.views.transcript_evidence': 'Transcript',
  'ui.components.unknown': 'Unknown'
}

function t(key) {
  return messages[key] || key
}

describe('meeting artifact formatting', () => {
  it('formats transcript timestamps with hour rollover support', () => {
    expect(formatTranscriptTimestamp(0)).toBe('00:00')
    expect(formatTranscriptTimestamp(65000)).toBe('01:05')
    expect(formatTranscriptTimestamp(3661000)).toBe('01:01:01')
  })

  it('formats chat and transcript evidence labels through provided translations', () => {
    expect(formatEvidenceLabel(null, t)).toBe('Evidence')
    expect(formatEvidenceLabel({ type: 'chat', author_display_name: 'Ada' }, t)).toBe('Chat: Ada')
    expect(formatEvidenceLabel({ type: 'chat' }, t)).toBe('Chat: Unknown')
    expect(formatEvidenceLabel({ type: 'transcript', speaker_label: 'Lin', start_ms: 62000 }, t))
      .toBe('Transcript: Lin @ 01:02')
  })
})
