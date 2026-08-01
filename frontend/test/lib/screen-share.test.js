import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildScreenShareWindowPath,
  isScreenShareOwnedByParticipant,
  openDetachedScreenShareWindow,
  pickFeaturedScreenShare
} from '../../src/lib/screen-share.js'

describe('screen share helpers', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    globalThis.window = originalWindow
    vi.restoreAllMocks()
  })

  it('prefers a pinned presenter when present', () => {
    const share = pickFeaturedScreenShare([
      { participantId: 'user-a', isLocal: false },
      { participantId: 'user-b', isLocal: true }
    ], 'user-a')

    expect(share).toEqual({ participantId: 'user-a', isLocal: false })
  })

  it('falls back to the local share when nothing is pinned', () => {
    const share = pickFeaturedScreenShare([
      { participantId: 'user-a', isLocal: false },
      { participantId: 'user-b', isLocal: true }
    ])

    expect(share).toEqual({ participantId: 'user-b', isLocal: true })
  })

  it('checks presenter ownership by participant id', () => {
    expect(isScreenShareOwnedByParticipant({ participantId: 'user-a' }, 'user-a')).toBe(true)
    expect(isScreenShareOwnedByParticipant({ participantId: 'user-a' }, 'user-b')).toBe(false)
  })

  it('builds detached screen-share paths for channel and meeting contexts', () => {
    expect(buildScreenShareWindowPath({ type: 'channel', id: 'channel-1' })).toBe('/channels/channel-1/screen-share')
    expect(buildScreenShareWindowPath({ type: 'meeting', id: 'meeting-1' })).toBe('/meetings/meeting-1/screen-share')
    expect(buildScreenShareWindowPath({ type: 'unknown', id: 'x' })).toBeNull()
    expect(buildScreenShareWindowPath({ type: 'meeting' })).toBeNull()
  })

  it('opens a detached screen-share window and records popup availability', () => {
    const focus = vi.fn()
    const popup = { focus }
    const open = vi.fn().mockReturnValue(popup)
    globalThis.window = { open }
    const router = {
      resolve: vi.fn((path) => ({ href: `#${path}` }))
    }
    const uiStore = {
      markScreenShareWindowOpen: vi.fn()
    }

    const result = openDetachedScreenShareWindow({ router, uiStore, type: 'meeting', id: 'meeting-2' })

    expect(router.resolve).toHaveBeenCalledWith('/meetings/meeting-2/screen-share')
    expect(open).toHaveBeenCalledWith(
      '#/meetings/meeting-2/screen-share',
      'nebulynk-screen-share',
      'popup=yes,width=1400,height=900,resizable=yes'
    )
    expect(uiStore.markScreenShareWindowOpen).toHaveBeenCalledWith(true)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(result).toBe(popup)
  })
})
