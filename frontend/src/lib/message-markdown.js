import MarkdownIt from 'markdown-it'
import markdownItTaskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'

const markdown = MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false
}).use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true })

const defaultLinkOpenRenderer = markdown.renderer.rules.link_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options))

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpenRenderer(tokens, idx, options, env, self)
}

const INLINE_IMAGE_PATTERN = /^https?:\/\/\S+\.(gif|png|jpg|jpeg|webp)(\?\S*)?$/i
const TENOR_MEDIA_PATTERN = /^https?:\/\/media\.tenor\.com\/\S+$/i

function normalizeContent(content) {
  return typeof content === 'string' ? content.replace(/\r\n/g, '\n') : ''
}

function sanitizeHtml(html, customSanitizeHtml) {
  if (typeof customSanitizeHtml === 'function') {
    return customSanitizeHtml(html)
  }

  if (typeof window === 'undefined' || typeof DOMPurify?.sanitize !== 'function') {
    return html
  }

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
    ADD_ATTR: ['target', 'rel']
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMentionMatchers(users = []) {
  return [...users]
    .filter((user) => typeof user?.display_name === 'string' && user.display_name.trim())
    .sort((left, right) => right.display_name.length - left.display_name.length)
    .map((user) => ({
      userId: user.id,
      regex: new RegExp(`@${escapeRegExp(user.display_name)}\\b`, 'gi')
    }))
}

function highlightMentionsInHtml(html, { users = [], selfUserId = null } = {}) {
  if (!html || typeof document === 'undefined') return html

  const container = document.createElement('div')
  container.innerHTML = html
  const userMatchers = buildMentionMatchers(users)
  const skipTags = new Set(['A', 'CODE', 'PRE', 'INPUT', 'TEXTAREA', 'BUTTON'])
  const showTextNode = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4
  const walker = document.createTreeWalker(container, showTextNode)
  const textNodes = []

  let currentNode = walker.nextNode()
  while (currentNode) {
    const parentTag = currentNode.parentElement?.tagName
    if (currentNode.nodeValue && !skipTags.has(parentTag)) {
      textNodes.push(currentNode)
    }
    currentNode = walker.nextNode()
  }

  for (const textNode of textNodes) {
    const fragment = document.createDocumentFragment()
    const source = textNode.nodeValue
    let cursor = 0

    while (cursor < source.length) {
      let match = null
      let matchClass = 'mention'
      let broadcastMention = false

      const specialMatch = /@(all|channel)\b/gi
      specialMatch.lastIndex = cursor
      const nextSpecial = specialMatch.exec(source)
      if (nextSpecial && (!match || nextSpecial.index < match.index)) {
        match = nextSpecial
        matchClass = 'mention mention-special'
        broadcastMention = true
      }

      for (const userMatcher of userMatchers) {
        userMatcher.regex.lastIndex = cursor
        const nextUserMatch = userMatcher.regex.exec(source)
        if (!nextUserMatch) continue
        if (!match || nextUserMatch.index < match.index) {
          match = nextUserMatch
          matchClass = userMatcher.userId === selfUserId ? 'mention mention-self' : 'mention'
          broadcastMention = false
        }
      }

      if (!match) {
        fragment.appendChild(document.createTextNode(source.slice(cursor)))
        break
      }

      if (match.index > cursor) {
        fragment.appendChild(document.createTextNode(source.slice(cursor, match.index)))
      }

      const span = document.createElement('span')
      span.className = matchClass
      span.textContent = match[0]
      if (broadcastMention) {
        span.setAttribute('data-mention-type', 'broadcast')
      }
      fragment.appendChild(span)
      cursor = match.index + match[0].length
    }

    textNode.parentNode?.replaceChild(fragment, textNode)
  }

  return container.innerHTML
}

function stripHtmlToText(html) {
  if (!html) return ''

  const withLineBreaks = html
    .replace(/<(br|\/p|\/div|\/li|\/blockquote|\/pre|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/gi, '[x] ')
    .replace(/<input[^>]*type="checkbox"[^>]*>/gi, '[ ] ')
    .replace(/<[^>]+>/g, ' ')

  const entityDecoded = withLineBreaks
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  return entityDecoded
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function stripMarkdownToText(markdownText) {
  return markdownText
    .replace(/```([\s\S]*?)```/g, (_, code) => `\n${code.trim()}\n`)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^(\s*)[-*+]\s+\[(x|X)\]\s+/gm, '$1[x] ')
    .replace(/^(\s*)[-*+]\s+\[\s\]\s+/gm, '$1[ ] ')
    .replace(/^(\s*)[-*+]\s+/gm, '$1')
    .replace(/^(\s*)\d+\.\s+/gm, '$1')
    .replace(/^(\s*)>\s?/gm, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\|/g, ' ')
}

export function isInlineImageMessage(content) {
  const normalized = normalizeContent(content).trim()
  return INLINE_IMAGE_PATTERN.test(normalized) || TENOR_MEDIA_PATTERN.test(normalized)
}

export function renderMessageMarkdown(content, options = {}) {
  const normalized = normalizeContent(content)
  if (!normalized.trim()) return ''

  const rendered = markdown.render(normalized)
  const sanitized = sanitizeHtml(rendered, options.sanitizeHtml)
  return highlightMentionsInHtml(sanitized, options)
}

export function toPlainMessageSnippet(content, options = {}) {
  const normalized = normalizeContent(content)
  if (!normalized.trim()) return ''
  if (isInlineImageMessage(normalized)) return normalized.trim()

  const rendered = markdown.render(stripMarkdownToText(normalized))
  const sanitized = sanitizeHtml(rendered, options.sanitizeHtml)
  const plain = stripHtmlToText(sanitized)
  const collapsed = plain.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

  if (typeof options.maxLength === 'number' && options.maxLength > 0 && collapsed.length > options.maxLength) {
    return `${collapsed.slice(0, Math.max(0, options.maxLength - 3)).trimEnd()}...`
  }

  return collapsed
}
