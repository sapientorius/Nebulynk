import { describe, expect, it } from 'vitest'
import { applyMarkdownToolbarAction } from '../../src/lib/message-markdown-toolbar.js'

describe('applyMarkdownToolbarAction', () => {
  it('wraps selections for inline formats', () => {
    expect(applyMarkdownToolbarAction({
      text: 'hello',
      selectionStart: 0,
      selectionEnd: 5,
      action: 'bold'
    })).toEqual({
      text: '**hello**',
      selectionStart: 2,
      selectionEnd: 7
    })

    expect(applyMarkdownToolbarAction({
      text: '',
      selectionStart: 0,
      selectionEnd: 0,
      action: 'inline-code'
    })).toEqual({
      text: '`code`',
      selectionStart: 1,
      selectionEnd: 5
    })
  })

  it('builds markdown links from selections', () => {
    expect(applyMarkdownToolbarAction({
      text: 'Nebulynk',
      selectionStart: 0,
      selectionEnd: 8,
      action: 'link'
    })).toEqual({
      text: '[Nebulynk](https://example.com)',
      selectionStart: 1,
      selectionEnd: 9
    })
  })

  it('formats multiline blocks for lists and quotes', () => {
    expect(applyMarkdownToolbarAction({
      text: 'first\nsecond',
      selectionStart: 0,
      selectionEnd: 12,
      action: 'numbered-list'
    }).text).toBe('1. first\n2. second')

    expect(applyMarkdownToolbarAction({
      text: 'quoted text',
      selectionStart: 3,
      selectionEnd: 8,
      action: 'blockquote'
    }).text).toBe('> quoted text')
  })

  it('creates fenced code blocks', () => {
    expect(applyMarkdownToolbarAction({
      text: 'const x = 1',
      selectionStart: 0,
      selectionEnd: 11,
      action: 'code-block'
    }).text).toBe('```\nconst x = 1\n```')
  })
})
