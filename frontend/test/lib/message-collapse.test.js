import { describe, expect, it } from 'vitest'
import {
  COLLAPSIBLE_MESSAGE_MAX_HEIGHT,
  shouldCollapseMessageContent
} from '../../src/lib/message-collapse.js'

describe('message collapse helpers', () => {
  it('collapses only when rendered content exceeds the maximum height', () => {
    expect(shouldCollapseMessageContent({
      renderedHeight: COLLAPSIBLE_MESSAGE_MAX_HEIGHT
    })).toBe(false)

    expect(shouldCollapseMessageContent({
      renderedHeight: COLLAPSIBLE_MESSAGE_MAX_HEIGHT + 24
    })).toBe(true)
  })

  it('does not collapse inline images or meeting cards', () => {
    expect(shouldCollapseMessageContent({
      renderedHeight: COLLAPSIBLE_MESSAGE_MAX_HEIGHT + 120,
      isInlineImage: true
    })).toBe(false)

    expect(shouldCollapseMessageContent({
      renderedHeight: COLLAPSIBLE_MESSAGE_MAX_HEIGHT + 120,
      hasMeetingCard: true
    })).toBe(false)
  })

  it('does not collapse empty or non-text message content', () => {
    expect(shouldCollapseMessageContent({
      renderedHeight: COLLAPSIBLE_MESSAGE_MAX_HEIGHT + 120,
      hasTextContent: false
    })).toBe(false)
  })
})
