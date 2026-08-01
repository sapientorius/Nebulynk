import { describe, expect, it, vi } from 'vitest'
import { navigateToDmChannel } from '../../src/lib/dm-navigation.js'

describe('navigateToDmChannel', () => {
  it('pushes the dm route and swallows expected router rejections', async () => {
    const catchMock = vi.fn()
    const push = vi.fn(() => ({ catch: catchMock }))

    await navigateToDmChannel({ push }, 'dm-42')

    expect(push).toHaveBeenCalledWith('/channels/dm-42')
    expect(catchMock).toHaveBeenCalled()
  })
})
