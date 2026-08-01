import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AskMeetingPanel', () => {
  it('owns Ask the Meeting history, citation links, and stable submit control', () => {
    const source = readFileSync(resolve('src/components/AskMeetingPanel.vue'), 'utf8')

    expect(source).toContain("name: 'AskMeetingPanel'")
    expect(source).toContain('data-testid="meeting-questions-panel"')
    expect(source).toContain('data-testid="meeting-ask-submit"')
    expect(source).toContain('compactHeader')
    expect(source).toContain("v-if=\"!compactHeader\"")
    expect(source).toContain('ui.views.loading_meeting_questions')
    expect(source).toContain('ui.views.no_meeting_questions')
    expect(source).toContain('entry.citations?.length')
    expect(source).toContain("@click=\"$emit('open-evidence', evidence)\"")
    expect(source).toContain("emits: ['update:question', 'ask-question', 'open-evidence']")
  })

  it('submits on Enter while preserving Shift+Enter and composition shortcuts', () => {
    const source = readFileSync(resolve('src/components/AskMeetingPanel.vue'), 'utf8')

    expect(source).toContain('@keydown="onQuestionKeydown"')
    expect(source).toContain("if (event.key !== 'Enter' || event.shiftKey) return")
    expect(source).toContain('if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return')
    expect(source).toContain("this.$emit('ask-question')")
  })

  it('uses shared artifact formatting for citation labels', () => {
    const source = readFileSync(resolve('src/components/AskMeetingPanel.vue'), 'utf8')

    expect(source).toContain("import { formatEvidenceLabel } from '../lib/meeting-artifact-format.js'")
    expect(source).toContain("formatEvidenceLabel(evidence, this.$t)")
  })
})
