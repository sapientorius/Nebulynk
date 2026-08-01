import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageRow', () => {
  it('owns one rendered message row with stable timeline test hooks', () => {
    const source = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')

    expect(source).toContain("name: 'MessageRow'")
    expect(source).toContain(':data-testid="`message-${message.id}`"')
    expect(source).toContain(':data-message-id="message.id"')
    expect(source).toContain(':data-message-body-id="message.id"')
    expect(source).toContain(':data-testid="`message-collapse-toggle-${message.id}`"')
    expect(source).toContain("'message-highlighted': highlighted")
    expect(source).toContain("'message-grouped': grouped")
  })

  it('keeps row UI concerns in the row while emitting side effects upward', () => {
    const source = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')

    expect(source).toContain('components: { ReactionBar, FilePreview, MessageActions, MeetingActionCard, MessageReminderIndicator, UserAvatar }')
    expect(source).toContain("@mouseenter=\"$emit('hover', message.id)\"")
    expect(source).toContain("@mouseleave=\"$emit('message-leave')\"")
    expect(source).toContain("@popover-change=\"$emit('popover-change', $event)\"")
    expect(source).toContain("@update:value=\"$emit('update:edit-text', $event)\"")
    expect(source).toContain("@keydown=\"$emit('edit-keydown', $event)\"")
    expect(source).toContain("@open=\"$emit('open-meeting', meetingCard.meetingId)\"")
    expect(source).toContain("@join=\"$emit('join-meeting-call', meetingCard.meetingId)\"")
    expect(source).toContain("@click=\"$emit('toggle-expanded', message.id)\"")
    expect(source).toContain("@summarize=\"$emit('summarize', $event)\"")
    expect(source).toContain("@update:checked=\"$emit('toggle-select', message.id)\"")
    expect(source).toContain('focusEditInput()')
  })

  it('preserves markdown, preview, collapse, and meeting-card rendering behavior', () => {
    const source = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')

    expect(source).toContain('renderMessageMarkdown(content')
    expect(source).toContain('users: this.renderUsers || []')
    expect(source).toContain('selfUserId: this.selfUserId || null')
    expect(source).toContain('renderPreviewSnippet(message.reply_preview)')
    expect(source).toContain('renderSnippet(message.forward_preview.source_message_snippet, 160)')
    expect(source).toContain('v-if="meetingCard"')
    expect(source).toContain("'message-body-collapsible': collapsible")
    expect(source).toContain("'message-body-collapsed': collapsed")
    expect(source).toContain("'message-body-expanded': expanded")
    expect(source).toContain("$t('ui.components.show_more')")
    expect(source).toContain("$t('ui.components.show_less')")
  })

  it('wires private AI summary affordances into row actions and selection mode', () => {
    const source = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')

    expect(source).toContain(':can-summarize="canSummarize"')
    expect(source).toContain(':summary-loading="summaryLoading"')
    expect(source).toContain('v-if="selectionMode"')
    expect(source).toContain('data-testid="message-summary-select"')
  })

  it('renders active reminder metadata for regular and grouped messages', () => {
    const source = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')

    expect(source).toContain("import MessageReminderIndicator from './MessageReminderIndicator.vue'")
    expect(source).toContain('<MessageReminderIndicator :message-id="message.id" />')
    expect(source).toContain('class="message-grouped-meta"')
    expect(source).toContain('.message-grouped-meta {')
    expect(source).toContain('position: absolute;')
    expect(source).toContain('top: 2px;')
    expect(source).toContain('left: 4px;')
    expect(source).toContain('.message-selecting .message-grouped-meta {')
    expect(source).toContain('left: 42px;')
  })

  it('keeps chat images within the available message column', () => {
    const rowSource = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')
    const filePreviewSource = readFileSync(resolve('src/components/FilePreview.vue'), 'utf8')

    expect(rowSource).toContain('max-width: min(400px, 100%);')
    expect(rowSource).toContain('height: auto;')
    expect(rowSource).toContain('box-sizing: border-box;')
    expect(filePreviewSource).toContain(':style="imagePreviewStyle"')
    expect(filePreviewSource).toContain("'--file-preview-max-width': `${this.previewWidth}px`")
    expect(filePreviewSource).toContain('width: 100%;')
    expect(filePreviewSource).toContain('max-width: min(var(--file-preview-max-width), 100%);')
    expect(filePreviewSource).toContain('.file-image :deep(img)')
  })
})
