import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadRecentEmojis, saveRecentEmoji } from '../../src/lib/recent-emojis.js'

describe('EmojiPicker recent emoji behavior', () => {
  it('does not autofocus its search input in the mobile layout', () => {
    const source = readFileSync(resolve('src/components/EmojiPicker.vue'), 'utf8')
    const mountedHook = source.slice(
      source.indexOf('mounted() {'),
      source.indexOf('methods: {')
    )

    expect(source).toContain("import { readIsMobileLayout } from '../lib/mobile-layout.js'")
    expect(mountedHook).toContain('if (readIsMobileLayout()) return')
    expect(mountedHook.indexOf('if (readIsMobileLayout()) return'))
      .toBeLessThan(mountedHook.indexOf('this.$refs.searchInput?.focus()'))
  })

  it('renders a recent section before the regular categories', () => {
    const source = readFileSync(resolve('src/components/EmojiPicker.vue'), 'utf8')

    expect(source).toContain('v-if="recentEmojiEntries.length > 0"')
    expect(source).toContain('data-testid="emoji-picker-recent-section"')
    expect(source).toContain('Zuletzt verwendet')
  })

  it('starts without recent emojis when storage is empty and hydrates from storage on open', () => {
    const source = readFileSync(resolve('src/components/EmojiPicker.vue'), 'utf8')

    expect(loadRecentEmojis()).toEqual([])
    expect(source).toContain('recentEmojis: []')
    expect(source).toContain('this.recentEmojis = loadRecentEmojis()')
  })

  it('maps stored recent emojis through the shared picker lookup', () => {
    const source = readFileSync(resolve('src/components/EmojiPicker.vue'), 'utf8')

    saveRecentEmoji('😀')
    saveRecentEmoji('😄')

    expect(loadRecentEmojis()).toEqual(['😄', '😀'])
    expect(source).toContain('const emojiLookup = new Map(allEmojis.map((entry) => [entry.emoji, entry]))')
    expect(source).toContain('.map((emoji) => emojiLookup.get(emoji))')
    expect(source).toContain('.filter(Boolean)')
  })

  it('updates MRU order through the picker selection handler', () => {
    const source = readFileSync(resolve('src/components/EmojiPicker.vue'), 'utf8')

    saveRecentEmoji('😄')
    saveRecentEmoji('😀')
    saveRecentEmoji('😄')

    expect(loadRecentEmojis()).toEqual(['😄', '😀'])
    expect(source).toContain('handleSelect(emoji) {')
    expect(source).toContain("this.recentEmojis = saveRecentEmoji(emoji)")
    expect(source).toContain("this.$emit('select', emoji)")
    expect(source).toContain('@click="handleSelect(e.emoji)"')
  })
})
