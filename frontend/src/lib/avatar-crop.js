function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function calculateAvatarCoverScale({ imageWidth, imageHeight, viewportSize }) {
  if (!imageWidth || !imageHeight || !viewportSize) return 1
  return Math.max(viewportSize / imageWidth, viewportSize / imageHeight)
}

export function constrainAvatarOffset({
  offsetX,
  offsetY,
  imageWidth,
  imageHeight,
  viewportSize,
  scale
}) {
  const displayWidth = imageWidth * scale
  const displayHeight = imageHeight * scale
  const maxOffsetX = Math.max(0, (displayWidth - viewportSize) / 2)
  const maxOffsetY = Math.max(0, (displayHeight - viewportSize) / 2)

  return {
    offsetX: clamp(offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(offsetY, -maxOffsetY, maxOffsetY)
  }
}

export function computeAvatarSourceRect({
  imageWidth,
  imageHeight,
  viewportSize,
  scale,
  offsetX,
  offsetY
}) {
  const displayWidth = imageWidth * scale
  const displayHeight = imageHeight * scale
  const topLeftX = (viewportSize - displayWidth) / 2 + offsetX
  const topLeftY = (viewportSize - displayHeight) / 2 + offsetY
  const sx = clamp((0 - topLeftX) / scale, 0, imageWidth)
  const sy = clamp((0 - topLeftY) / scale, 0, imageHeight)
  const sw = clamp(viewportSize / scale, 1, imageWidth - sx)
  const sh = clamp(viewportSize / scale, 1, imageHeight - sy)

  return { sx, sy, sw, sh }
}
