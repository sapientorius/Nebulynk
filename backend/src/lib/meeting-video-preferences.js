export const DEFAULT_MEETING_VIDEO_PREFERENCES = Object.freeze({
  background_mode: 'none',
  preferred_camera_device_id: null,
  background_image_id: null,
  video_mirror: false
})

export function normalizeMeetingVideoPreferences(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const backgroundMode = source.background_mode === 'blur' || source.background_mode === 'image'
    ? source.background_mode
    : DEFAULT_MEETING_VIDEO_PREFERENCES.background_mode
  const preferredCameraDeviceId = typeof source.preferred_camera_device_id === 'string' && source.preferred_camera_device_id.trim()
    ? source.preferred_camera_device_id.trim()
    : null
  const backgroundImageId = backgroundMode === 'image' && typeof source.background_image_id === 'string' && source.background_image_id.trim()
    ? source.background_image_id.trim()
    : null
  const videoMirror = source.video_mirror === true

  return {
    background_mode: backgroundMode,
    preferred_camera_device_id: preferredCameraDeviceId,
    background_image_id: backgroundImageId,
    video_mirror: videoMirror
  }
}
