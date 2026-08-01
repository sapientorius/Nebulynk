import { describe, expect, it } from 'vitest'
import { parseMeetingReferenceContent } from '../../src/lib/meeting-message.js'

describe('parseMeetingReferenceContent', () => {
  it('returns meeting id for exact source meeting marker format', () => {
    expect(parseMeetingReferenceContent('[Meeting] /meetings/bl916qz6kdoyp4k5mvz9zey6'))
      .toBe('bl916qz6kdoyp4k5mvz9zey6')
  })

  it('returns null for non-matching content', () => {
    expect(parseMeetingReferenceContent('Join: /meetings/bl916qz6kdoyp4k5mvz9zey6')).toBeNull()
    expect(parseMeetingReferenceContent('[Meeting] /meetings/BL916QZ6KDOYP4K5MVZ9ZEY6')).toBeNull()
    expect(parseMeetingReferenceContent('[Meeting] /meetings/bl916qz6kdoyp4k5mvz9zey6 extra')).toBeNull()
    expect(parseMeetingReferenceContent('')).toBeNull()
    expect(parseMeetingReferenceContent(null)).toBeNull()
  })
})

