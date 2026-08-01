export const SCREEN_SHARE_PUBLISH_QUALITIES = ['performance', 'balanced', 'sharp']
export const SCREEN_SHARE_VIEW_QUALITIES = ['auto', 'high', 'medium', 'low']

export const DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY = 'balanced'
export const DEFAULT_SCREEN_SHARE_VIEW_QUALITY = 'auto'

export const SCREEN_SHARE_PUBLISH_STORAGE_KEY = 'screenSharePublishQuality'
export const SCREEN_SHARE_VIEW_STORAGE_KEY = 'screenShareViewQuality'

export const SCREEN_SHARE_PRESET_KEYS = {
  performance: 'h720fps15',
  balanced: 'h1080fps15',
  sharp: 'h1080fps30'
}

export function normalizeScreenSharePublishQuality(value) {
  if (SCREEN_SHARE_PUBLISH_QUALITIES.includes(value)) {
    return value
  }
  return DEFAULT_SCREEN_SHARE_PUBLISH_QUALITY
}

export function normalizeScreenShareViewQuality(value) {
  if (SCREEN_SHARE_VIEW_QUALITIES.includes(value)) {
    return value
  }
  return DEFAULT_SCREEN_SHARE_VIEW_QUALITY
}
