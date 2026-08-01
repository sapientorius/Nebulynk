import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecentEmojis, MAX_RECENT_EMOJIS, saveRecentEmoji } from '../../src/lib/recent-emojis.js'

describe('recent emoji storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty list when nothing is stored', () => {
    expect(loadRecentEmojis()).toEqual([])
  })

  it('stores the latest selection first and removes duplicates', () => {
    saveRecentEmoji('😀')
    saveRecentEmoji('😄')
    const result = saveRecentEmoji('😀')

    expect(result).toEqual(['😀', '😄'])
    expect(JSON.parse(localStorage.getItem('recentEmojis'))).toEqual(['😀', '😄'])
  })

  it('caps the list at the configured maximum size', () => {
    for (let index = 0; index < MAX_RECENT_EMOJIS + 3; index += 1) {
      saveRecentEmoji(`emoji-${index}`)
    }

    expect(loadRecentEmojis()).toHaveLength(MAX_RECENT_EMOJIS)
    expect(loadRecentEmojis()[0]).toBe(`emoji-${MAX_RECENT_EMOJIS + 2}`)
  })

  it('ignores invalid persisted payloads', () => {
    localStorage.setItem('recentEmojis', '{invalid json')
    expect(loadRecentEmojis()).toEqual([])

    localStorage.setItem('recentEmojis', JSON.stringify(['😀', '😀', '', null, '😄']))
    expect(loadRecentEmojis()).toEqual(['😀', '😄'])
  })
})
