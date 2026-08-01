import { describe, expect, it } from 'vitest'
import {
  isInlineImageMessage,
  renderMessageMarkdown,
  toPlainMessageSnippet
} from '../../src/lib/message-markdown.js'

describe('message markdown helpers', () => {
  it('renders core markdown syntax', () => {
    const html = renderMessageMarkdown('**bold** _italic_ `code`')

    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders links with safe external-target attributes', () => {
    const html = renderMessageMarkdown('Visit https://example.com and [docs](https://docs.example.com)')

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('href="https://docs.example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders extended markdown structures like tables and task lists', () => {
    const tableHtml = renderMessageMarkdown('| Col |\n| --- |\n| Value |')
    const taskHtml = renderMessageMarkdown('- [x] done')

    expect(tableHtml).toContain('<table>')
    expect(taskHtml).toContain('task-list-item')
  })

  it('uses the sanitize hook when provided', () => {
    const html = renderMessageMarkdown('hello', {
      sanitizeHtml: (value) => value.replace('hello', 'safe')
    })

    expect(html).toContain('safe')
    expect(html).not.toContain('hello')
  })

  it('converts markdown to readable plain-text snippets', () => {
    const snippet = toPlainMessageSnippet('## Heading\n- [x] ship [docs](https://example.com)')

    expect(snippet).toContain('Heading')
    expect(snippet).toContain('[x] ship docs')
    expect(snippet).not.toContain('https://example.com')
  })

  it('recognizes inline image messages', () => {
    expect(isInlineImageMessage('https://example.com/image.png')).toBe(true)
    expect(isInlineImageMessage('https://media.tenor.com/abc123')).toBe(true)
    expect(isInlineImageMessage('plain text')).toBe(false)
  })
})
