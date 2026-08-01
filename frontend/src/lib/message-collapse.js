export const COLLAPSIBLE_MESSAGE_MAX_HEIGHT = 320
export const COLLAPSIBLE_MESSAGE_FADE_SIZE = 72

export function shouldCollapseMessageContent({
  renderedHeight = 0,
  maxHeight = COLLAPSIBLE_MESSAGE_MAX_HEIGHT,
  hasTextContent = true,
  isInlineImage = false,
  hasMeetingCard = false
} = {}) {
  if (!hasTextContent || isInlineImage || hasMeetingCard) return false
  return Number(renderedHeight) > Number(maxHeight) + 1
}
