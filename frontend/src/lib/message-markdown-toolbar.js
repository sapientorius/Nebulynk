function clampSelection(value, textLength) {
  const numeric = Number.isFinite(value) ? value : 0
  return Math.max(0, Math.min(textLength, numeric))
}

function createResult(text, selectionStart, selectionEnd) {
  return { text, selectionStart, selectionEnd }
}

function replaceRange(text, start, end, replacement, selectionStart, selectionEnd) {
  const nextText = `${text.slice(0, start)}${replacement}${text.slice(end)}`
  return createResult(nextText, selectionStart, selectionEnd)
}

function wrapSelection(text, start, end, prefix, suffix, placeholder) {
  const selected = text.slice(start, end)
  const nextValue = selected || placeholder
  return replaceRange(
    text,
    start,
    end,
    `${prefix}${nextValue}${suffix}`,
    start + prefix.length,
    start + prefix.length + nextValue.length
  )
}

function findLineStart(text, index) {
  const lastBreak = text.lastIndexOf('\n', Math.max(0, index - 1))
  return lastBreak === -1 ? 0 : lastBreak + 1
}

function findLineEnd(text, index) {
  const nextBreak = text.indexOf('\n', index)
  return nextBreak === -1 ? text.length : nextBreak
}

function prefixSelectedLines(text, start, end, prefixBuilder) {
  const lineStart = findLineStart(text, start)
  const lineEnd = findLineEnd(text, end)
  const selection = text.slice(lineStart, lineEnd)
  const lines = selection.split('\n')
  const prefixedLines = lines.map((line, index) => {
    const prefix = typeof prefixBuilder === 'function' ? prefixBuilder(index, line) : prefixBuilder
    return `${prefix}${line}`
  })
  const replacement = prefixedLines.join('\n')
  return replaceRange(text, lineStart, lineEnd, replacement, lineStart, lineStart + replacement.length)
}

function formatLink(text, start, end) {
  const selected = text.slice(start, end).trim()
  const label = selected || 'link text'
  const url = selected && /^https?:\/\//i.test(selected) ? selected : 'https://example.com'
  const replacement = `[${label}](${url})`
  const nextSelectionStart = start + 1
  const nextSelectionEnd = start + 1 + label.length
  return replaceRange(text, start, end, replacement, nextSelectionStart, nextSelectionEnd)
}

function formatCodeBlock(text, start, end) {
  const selected = text.slice(start, end)
  const body = selected || 'code'
  const replacement = `\`\`\`\n${body}\n\`\`\``
  const offset = selected ? 4 : 4
  return replaceRange(text, start, end, replacement, start + offset, start + offset + body.length)
}

export function applyMarkdownToolbarAction({
  text = '',
  selectionStart = 0,
  selectionEnd = 0,
  action
} = {}) {
  const normalizedText = typeof text === 'string' ? text : ''
  const start = clampSelection(selectionStart, normalizedText.length)
  const end = clampSelection(selectionEnd, normalizedText.length)

  switch (action) {
    case 'bold':
      return wrapSelection(normalizedText, start, end, '**', '**', 'bold text')
    case 'italic':
      return wrapSelection(normalizedText, start, end, '_', '_', 'italic text')
    case 'strikethrough':
      return wrapSelection(normalizedText, start, end, '~~', '~~', 'struck text')
    case 'inline-code':
      return wrapSelection(normalizedText, start, end, '`', '`', 'code')
    case 'link':
      return formatLink(normalizedText, start, end)
    case 'code-block':
      return formatCodeBlock(normalizedText, start, end)
    case 'blockquote':
      return prefixSelectedLines(normalizedText, start, end, '> ')
    case 'bulleted-list':
      return prefixSelectedLines(normalizedText, start, end, '- ')
    case 'numbered-list':
      return prefixSelectedLines(normalizedText, start, end, (index) => `${index + 1}. `)
    case 'heading':
      return prefixSelectedLines(normalizedText, start, end, '# ')
    default:
      return createResult(normalizedText, start, end)
  }
}
