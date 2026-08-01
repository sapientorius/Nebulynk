import { isOptimizableImageFile, normalizeUploadSettings } from './upload-settings.js'

function getBaseName(filename = 'image') {
  const cleaned = String(filename || 'image').trim() || 'image'
  return cleaned.replace(/\.[^.]+$/, '') || 'image'
}

function computeTargetSize({ width, height, maxDimension }) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 1))
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1))
  const longestEdge = Math.max(sourceWidth, sourceHeight)

  if (longestEdge <= maxDimension) {
    return { width: sourceWidth, height: sourceHeight }
  }

  const scale = maxDimension / longestEdge
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  }
}

function createObjectUrl(file) {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  return URL.createObjectURL(file)
}

function revokeObjectUrl(url) {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  URL.revokeObjectURL(url)
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = createObjectUrl(file)
    if (!objectUrl || typeof Image === 'undefined') {
      reject(new Error('Image decoding is unavailable'))
      return
    }

    const image = new Image()
    image.onload = () => {
      revokeObjectUrl(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      revokeObjectUrl(objectUrl)
      reject(new Error('Image could not be decoded'))
    }
    image.src = objectUrl
  })
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })
}

export function getOptimizedImageName(file) {
  return `${getBaseName(file?.name)}.webp`
}

export async function optimizeImageForUpload(file, rawSettings = {}) {
  const settings = normalizeUploadSettings(rawSettings)

  if (!isOptimizableImageFile(file)) {
    return {
      file,
      optimized: false,
      reason: 'unsupported'
    }
  }

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return {
      file,
      optimized: false,
      reason: 'canvas_unavailable'
    }
  }

  try {
    const image = await loadImage(file)
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const target = computeTargetSize({
      width: sourceWidth,
      height: sourceHeight,
      maxDimension: settings.imageMaxDimensionPx
    })

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context unavailable')

    context.drawImage(image, 0, 0, target.width, target.height)

    const blob = await canvasToBlob(canvas, 'image/webp', settings.imageQualityRatio)
    if (!blob || blob.size >= file.size) {
      return {
        file,
        optimized: false,
        reason: blob ? 'larger_than_original' : 'blob_unavailable'
      }
    }

    const optimizedFile = new File([blob], getOptimizedImageName(file), {
      type: 'image/webp',
      lastModified: file.lastModified || Date.now()
    })

    return {
      file: optimizedFile,
      optimized: true,
      originalFile: file,
      originalSize: file.size,
      outputSize: optimizedFile.size,
      width: target.width,
      height: target.height
    }
  } catch {
    return {
      file,
      optimized: false,
      reason: 'failed'
    }
  }
}
