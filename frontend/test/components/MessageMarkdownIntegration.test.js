import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('message markdown integration', () => {
  it('wires markdown toolbar actions into MessageInput', () => {
    const source = readFileSync(resolve('src/components/MessageInput.vue'), 'utf8')

    expect(source).toContain('data-testid="message-markdown-toolbar"')
    expect(source).toContain('applyMarkdownToolbarAction({')
    expect(source).toContain("id: 'bold'")
    expect(source).toContain("id: 'code-block'")
    expect(source).toContain('replySnippet()')
    expect(source).toContain('toPlainMessageSnippet(this.replyContext?.content || \'\'')
  })

  it('renders markdown in MessageRow and keeps MessageList as the timeline container', () => {
    const listSource = readFileSync(resolve('src/components/MessageList.vue'), 'utf8')
    const rowSource = readFileSync(resolve('src/components/MessageRow.vue'), 'utf8')
    const pinnedSource = readFileSync(resolve('src/components/PinnedMessages.vue'), 'utf8')
    const notificationsSource = readFileSync(resolve('src/components/NotificationsPanel.vue'), 'utf8')
    const searchSource = readFileSync(resolve('src/components/GlobalSearchDialog.vue'), 'utf8')

    expect(listSource).toContain('overflow-x: visible;')
    expect(listSource).toContain('<MessageRow')
    expect(listSource).toContain('@toggle-expanded="toggleMessageExpanded"')
    expect(rowSource).toContain('renderMessageMarkdown(content')
    expect(rowSource).toContain('message-collapse-toggle')
    expect(rowSource).toContain('max-width: min(400px, 100%);')
    expect(rowSource).toContain('height: auto;')
    expect(rowSource).toContain('box-sizing: border-box;')
    expect(rowSource).toContain("$t('ui.components.show_more')")
    expect(rowSource).toContain("$t('ui.components.show_less')")
    expect(rowSource).toContain('renderSnippet(message.forward_preview.source_message_snippet, 160)')
    expect(rowSource).toContain('.message-highlighted')
    expect(rowSource).toContain('box-shadow: 0 0 0 1px rgba(var(--theme-primary-rgb), 0.35);')
    expect(pinnedSource).toContain('renderPinnedContent(pin.message_content)')
    expect(notificationsSource).toContain('notificationSnippet(notif)')
    expect(searchSource).toContain('resultSnippet(result)')
  })
})
