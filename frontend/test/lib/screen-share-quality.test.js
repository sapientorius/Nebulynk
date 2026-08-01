import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY,
  DEFAULT_SCREEN_SHARE_VIEW_QUALITY,
  SCREEN_SHARE_PRESET_KEYS,
  normalizeScreenSharePublishQuality,
  normalizeScreenShareViewQuality
} from '../../src/lib/screen-share-quality.js'

describe('screen share quality helpers', () => {
  it('maps publish profiles to the expected LiveKit preset keys', () => {
    expect(SCREEN_SHARE_PRESET_KEYS.performance).toBe('h720fps15')
    expect(SCREEN_SHARE_PRESET_KEYS.balanced).toBe('h1080fps15')
    expect(SCREEN_SHARE_PRESET_KEYS.sharp).toBe('h1080fps30')
  })

  it('defaults publish quality to balanced when the input is invalid', () => {
    expect(normalizeScreenSharePublishQuality('nope')).toBe(DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY)
  })

  it('defaults viewer quality to auto when the input is invalid', () => {
    expect(normalizeScreenShareViewQuality('ultra')).toBe(DEFAULT_SCREEN_SHARE_VIEW_QUALITY)
  })
})
