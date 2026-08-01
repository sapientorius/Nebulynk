import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('VideoSettingsContent source contract', () => {
  it('uses processed preview tracks visible background controls', () => {
    const source = readFileSync(resolve('src/components/VideoSettingsContent.vue'), 'utf8')

    expect(source).toContain('data-testid="video-settings-content"')
    expect(source).toContain('video_background_preview')
    expect(source).toContain('createLocalCameraPreview')
    expect(source).toContain('stopLocalCameraPreview')
    expect(source).not.toContain('navigator.mediaDevices.getUserMedia')
    expect(source).not.toContain('video-preview-frame-blur')
    expect(source).not.toContain('filter: blur')
    expect(source).not.toContain('camera_in_use')
    expect(source).not.toContain('activeCameraLabel')

    expect(source).toContain('data-testid="video-settings-background-mode"')
    expect(source).toContain('backgroundModeOptions')
    expect(source).toContain("value: 'none'")
    expect(source).toContain("value: 'blur'")
    expect(source).toContain("value: 'image'")
    expect(source).toContain('disabled: !this.blurSupported')
    expect(source).toContain('disabled: this.backgrounds.length === 0')
  })

  it('persists and renders local video mirror preference', () => {
    const source = readFileSync(resolve('src/components/VideoSettingsContent.vue'), 'utf8')

    expect(source).toContain('data-testid="video-settings-video-mirror"')
    expect(source).toContain('videoMirrorEnabled')
    expect(source).toContain('this.preferences.video_mirror === true')
    expect(source).toContain('updateMeetingVideoPreferences({ video_mirror: videoMirror })')
    expect(source).toContain('video-preview-frame video.mirrored')
  })

  it('keeps upload, gated generation, global background actions', () => {
    const source = readFileSync(resolve('src/components/VideoSettingsContent.vue'), 'utf8')

    expect(source).toContain('video_background_upload')
    expect(source).toContain('v-if="imageGenerationAvailable" class="video-generate-row"')
    expect(source).toContain('data-testid="video-background-generate"')
    expect(source).not.toContain('video_background_generation_unavailable')
    expect(source).toContain('manage_video_backgrounds')
    expect(source).toContain('publishSelectedBackground')
    expect(source).toContain('unpublishSelectedBackground')
    expect(source).toContain('deleteSelectedBackground')
  })
})
