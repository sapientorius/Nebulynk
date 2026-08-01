import { describe, expect, it } from 'vitest'
import {
  calculateAvatarCoverScale,
  computeAvatarSourceRect,
  constrainAvatarOffset
} from '../../src/lib/avatar-crop.js'

describe('avatar crop helpers', () => {
  it('uses a cover scale so the image always fills the crop viewport', () => {
    expect(calculateAvatarCoverScale({
      imageWidth: 800,
      imageHeight: 400,
      viewportSize: 280
    })).toBe(0.7)
  })

  it('clamps drag offsets so the crop viewport never exposes empty space', () => {
    const constrained = constrainAvatarOffset({
      offsetX: 999,
      offsetY: -999,
      imageWidth: 400,
      imageHeight: 400,
      viewportSize: 280,
      scale: 1
    })

    expect(constrained).toEqual({
      offsetX: 60,
      offsetY: -60
    })
  })

  it('computes a valid source rectangle for canvas export', () => {
    const rect = computeAvatarSourceRect({
      imageWidth: 400,
      imageHeight: 300,
      viewportSize: 280,
      scale: 1,
      offsetX: 20,
      offsetY: -10
    })

    expect(rect).toEqual({
      sx: 40,
      sy: 20,
      sw: 280,
      sh: 280
    })
  })
})
