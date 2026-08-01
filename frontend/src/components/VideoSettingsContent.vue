<template>
  <div class="video-settings-layout" data-testid="video-settings-content">
    <section class="video-preview-panel">
      <div class="video-preview-label">{{ $t('ui.views.video_background_preview') }}</div>
      <div class="video-preview-frame">
 <video ref="previewVideo" :class="{ mirrored: videoMirrorEnabled }" autoplay muted playsinline />
        <div v-if="previewError" class="video-preview-error">{{ previewError }}</div>
      </div>
    </section>

    <n-form class="video-settings-form" label-placement="top">
      <n-form-item :label="$t('ui.views.preferred_camera')">
        <div class="video-settings-field">
          <n-select
            :value="cameraPreferenceValue"
            :options="cameraOptions"
            :placeholder="$t('ui.views.preferred_camera')"
            :loading="loadingDevices"
            :disabled="cameraSelectionDisabled"
            data-testid="video-settings-camera-select"
            @update:value="onCameraChange"
          />
          <div class="setting-hint">{{ preferredCameraDescription }}</div>
        </div>
      </n-form-item>

      <n-form-item :label="$t('ui.views.video_mirror')">
        <div class="video-settings-toggle-row">
          <n-switch
            :value="videoMirrorEnabled"
            :disabled="savingMirror"
            data-testid="video-settings-video-mirror"
            @update:value="onVideoMirrorChange"
          />
          <div class="setting-hint">{{ $t('ui.views.video_mirror_description') }}</div>
        </div>
      </n-form-item>

      <n-form-item :label="$t('ui.views.video_backgrounds')">
        <div class="video-settings-field">
          <div class="video-background-mode-control" data-testid="video-settings-background-mode" role="group">
            <button
              v-for="option in backgroundModeOptions"
              :key="option.value"
              type="button"
              class="video-background-mode-button"
              :class="{ selected: backgroundMode === option.value }"
              :disabled="option.disabled || savingBackground"
              :aria-pressed="backgroundMode === option.value"
              @click="onBackgroundModeChange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <div v-if="!blurSupported" class="setting-hint">
            {{ $t('ui.components.background_blur_not_supported') }}
          </div>

          <div class="video-background-toolbar">
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onUploadSelected" />
            <n-button size="small" :loading="videoBackgroundsStore.saving" @click="$refs.fileInput?.click()">
              {{ $t('ui.views.video_background_upload') }}
            </n-button>
          </div>

          <div v-if="imageGenerationAvailable" class="video-generate-row">
            <n-input
              v-model:value="generationPrompt"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              :placeholder="$t('ui.views.video_background_prompt_placeholder')"
              data-testid="video-background-generate-prompt"
            />
            <n-button
              type="primary"
              :disabled="!canGenerateBackground"
              :loading="videoBackgroundsStore.generating"
              data-testid="video-background-generate"
              @click="generateBackground"
            >
              {{ $t('ui.views.video_background_generate') }}
            </n-button>
          </div>

          <div v-if="videoBackgroundsStore.loading" class="setting-hint">...</div>
          <div v-else-if="backgrounds.length === 0" class="setting-hint">
            {{ $t('ui.views.video_background_empty') }}
          </div>
          <div v-else class="video-background-grid">
            <button
              v-for="background in backgrounds"
              :key="background.id"
              type="button"
              class="video-background-item"
              :class="{ selected: selectedBackgroundId === background.id }"
              data-testid="video-background-item"
              @click="selectBackground(background)"
            >
              <img v-if="backgroundPreviewUrls[background.id]" :src="backgroundPreviewUrls[background.id]" alt="" />
              <span v-else class="video-background-placeholder">{{ background.title || background.source }}</span>
              <span v-if="background.is_global" class="video-background-badge">
                {{ $t('ui.views.video_background_global') }}
              </span>
            </button>
          </div>

          <div v-if="selectedBackground" class="video-background-actions">
            <n-button
              v-if="canManageVideoBackgrounds && !selectedBackground.is_global"
              size="small"
              @click="publishSelectedBackground"
            >
              {{ $t('ui.views.video_background_publish') }}
            </n-button>
            <n-button
              v-if="canManageVideoBackgrounds && selectedBackground.is_global"
              size="small"
              @click="unpublishSelectedBackground"
            >
              {{ $t('ui.views.video_background_unpublish') }}
            </n-button>
            <n-button size="small" tertiary type="error" @click="deleteSelectedBackground">
              {{ $t('ui.views.video_background_delete') }}
            </n-button>
          </div>
        </div>
      </n-form-item>
    </n-form>
  </div>
</template>

<script>
import {
  createLocalCameraPreview,
  getVideoInputDevices,
  stopLocalCameraPreview
} from '../lib/livekit.js'
import { useSessionStore, useVideoBackgroundsStore, useVoiceStore } from '../stores/index.js'

const AUTOMATIC_CAMERA_VALUE = '__automatic__'

export default {
  name: 'VideoSettingsContent',
  props: {
    active: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      cameraDevices: [],
 loadingDevices: false,
 savingCamera: false,
 savingMirror: false,
 savingBackground: false,
      previewTrack: null,
      previewRequestId: 0,
      previewError: null,
      backgroundPreviewUrls: {},
      generationPrompt: ''
    }
  },
  computed: {
    sessionStore() {
      return useSessionStore()
    },
    voiceStore() {
      return useVoiceStore()
    },
    videoBackgroundsStore() {
      return useVideoBackgroundsStore()
    },
    backgrounds() {
      return this.videoBackgroundsStore.backgrounds
    },
    imageGenerationAvailable() {
      return this.videoBackgroundsStore.imageGenerationAvailable
    },
    canGenerateBackground() {
      return this.imageGenerationAvailable && this.generationPrompt.trim().length >= 3
    },
    canManageVideoBackgrounds() {
      return this.sessionStore.hasPermission?.('manage_video_backgrounds') === true
    },
 preferences() {
 return this.sessionStore.user?.meeting_video_preferences || {}
 },
 videoMirrorEnabled() {
 return this.preferences.video_mirror === true
 },
 backgroundMode() {
      return this.preferences.background_mode || 'none'
    },
    selectedBackgroundId() {
      return this.preferences.background_image_id || null
    },
    selectedBackground() {
      return this.backgrounds.find((entry) => entry.id === this.selectedBackgroundId) || null
    },
    backgroundModeOptions() {
      return [
        {
          label: this.$t('ui.views.video_background_none'),
          value: 'none',
          disabled: false
        },
        {
          label: this.$t('ui.views.background_blur'),
          value: 'blur',
          disabled: !this.blurSupported
        },
        {
          label: this.$t('ui.views.video_background_image'),
          value: 'image',
          disabled: this.backgrounds.length === 0
        }
      ]
    },
    cameraOptions() {
      return [
        { label: this.$t('ui.views.camera_default_option'), value: AUTOMATIC_CAMERA_VALUE },
        ...this.cameraDevices.map((device) => ({
          label: device.label || this.$t('ui.views.camera_device_fallback', { deviceId: device.deviceId.slice(0, 8) }),
          value: device.deviceId
        }))
      ]
    },
    cameraPreferenceValue() {
      return this.preferences.preferred_camera_device_id || AUTOMATIC_CAMERA_VALUE
    },
    preferredCameraDescription() {
      if (this.cameraDevices.length === 0) return this.$t('ui.views.no_camera_devices')
      return this.$t('ui.views.preferred_camera_description')
    },
    cameraSelectionDisabled() {
      return this.loadingDevices || this.savingCamera || this.cameraDevices.length === 0
    },
 blurSupported() {
 return this.voiceStore.backgroundBlurSupported
 }
  },
  watch: {
    active: {
      immediate: true,
      handler(value) {
        if (value) this.activate()
        else this.deactivate()
      }
    },
    cameraPreferenceValue() {
      if (this.active) this.startPreview()
    },
    backgroundMode() {
      if (this.active) this.startPreview()
    },
    selectedBackgroundId() {
      if (this.active && this.backgroundMode === 'image') this.startPreview()
    }
  },
  beforeUnmount() {
    this.deactivate()
    this.videoBackgroundsStore.disposeObjectUrls()
  },
  methods: {
    async activate() {
      await Promise.all([this.loadDevices(), this.loadBackgrounds()])
      await this.startPreview()
    },
    deactivate() {
      this.stopPreview()
    },
    async loadDevices() {
      this.loadingDevices = true
      try {
        this.cameraDevices = await getVideoInputDevices()
      } catch (error) {
        console.error('Failed to load camera devices:', error)
        this.cameraDevices = []
      } finally {
        this.loadingDevices = false
      }
    },
    async loadBackgrounds() {
      try {
        await this.videoBackgroundsStore.loadBackgrounds()
        await Promise.all(this.backgrounds.map((background) => this.ensurePreviewUrl(background)))
      } catch (error) {
        console.error('Failed to load video backgrounds:', error)
      }
    },
    async ensurePreviewUrl(background) {
      if (!background?.id || this.backgroundPreviewUrls[background.id]) return this.backgroundPreviewUrls[background.id] || null
      const url = await this.videoBackgroundsStore.ensureObjectUrl(background)
      this.backgroundPreviewUrls = { ...this.backgroundPreviewUrls, [background.id]: url }
      return url
    },
    async resolvePreviewBackgroundUrl() {
      if (this.backgroundMode !== 'image' || !this.selectedBackground) return null
      return this.ensurePreviewUrl(this.selectedBackground)
    },
    stopPreview({ cancelPending = true } = {}) {
      if (cancelPending) {
        this.previewRequestId += 1
      }
      const track = this.previewTrack
      this.previewTrack = null
      if (this.$refs.previewVideo) {
        this.$refs.previewVideo.srcObject = null
      }
      stopLocalCameraPreview(track, this.$refs.previewVideo).catch(() => {})
    },
    async startPreview() {
      const requestId = this.previewRequestId + 1
      this.previewRequestId = requestId
      this.stopPreview({ cancelPending: false })
      this.previewError = null

      try {
        const preferredDeviceId = this.cameraPreferenceValue === AUTOMATIC_CAMERA_VALUE ? null : this.cameraPreferenceValue
        const backgroundUrl = await this.resolvePreviewBackgroundUrl()
        const track = await createLocalCameraPreview({
          deviceId: preferredDeviceId,
          backgroundBlurEnabled: this.backgroundMode === 'blur',
          virtualBackgroundImageUrl: this.backgroundMode === 'image' ? backgroundUrl : null
        })

        if (requestId !== this.previewRequestId) {
          await stopLocalCameraPreview(track)
          return
        }

        this.previewTrack = track
        if (this.$refs.previewVideo) {
          track.attach?.(this.$refs.previewVideo)
          this.$refs.previewVideo.muted = true
          this.$refs.previewVideo.play?.().catch(() => {})
        }
      } catch (error) {
        if (requestId !== this.previewRequestId) return
        console.error('Failed to start video settings preview:', error)
        this.previewError = this.$t('ui.errors.cameraUnavailable')
      }
    },
 async onCameraChange(value) {
 const preferredCameraDeviceId = value === AUTOMATIC_CAMERA_VALUE ? null : value
 this.savingCamera = true
      try {
        await this.sessionStore.updateMeetingVideoPreferences({
          preferred_camera_device_id: preferredCameraDeviceId
        })
        await this.voiceStore.setPreferredCameraDevice(preferredCameraDeviceId)
        await this.startPreview()
      } catch (error) {
        console.error('Failed to update preferred camera:', error)
        window.$message?.error(this.$t('ui.components.camera_preference_update_failed'))
 } finally {
 this.savingCamera = false
 }
 },
 async onVideoMirrorChange(value) {
 const videoMirror = value === true
 if (videoMirror === this.videoMirrorEnabled) return

 this.savingMirror = true
 try {
 await this.sessionStore.updateMeetingVideoPreferences({ video_mirror: videoMirror })
 } catch (error) {
 console.error('Failed update video mirror preference:', error)
 window.$message?.error(this.$t('ui.views.video_mirror_save_failed'))
 } finally {
 this.savingMirror = false
 }
 },
 isBackgroundModeDisabled(mode) {
      return this.backgroundModeOptions.some((option) => option.value === mode && option.disabled)
    },
    async onBackgroundModeChange(mode) {
      if (mode === this.backgroundMode || this.isBackgroundModeDisabled(mode)) return
      if (mode === 'image' && !this.selectedBackgroundId && this.backgrounds[0]) {
        await this.selectBackground(this.backgrounds[0])
        return
      }
      await this.saveBackgroundPreference({
        background_mode: mode,
        background_image_id: mode === 'image' ? this.selectedBackgroundId : null
      })
    },
    async selectBackground(background) {
      await this.ensurePreviewUrl(background)
      await this.saveBackgroundPreference({
        background_mode: 'image',
        background_image_id: background.id
      })
    },
    async saveBackgroundPreference(patch) {
      this.savingBackground = true
      try {
        await this.sessionStore.updateMeetingVideoPreferences(patch)
        await this.applyCurrentBackgroundToCall(patch)
        if (this.active) {
          await this.startPreview()
        }
      } catch (error) {
        console.error('Failed to update video background:', error)
        window.$message?.error(this.$t('ui.views.video_background_save_failed'))
      } finally {
        this.savingBackground = false
      }
    },
    async applyCurrentBackgroundToCall(patch = {}) {
      if (!this.voiceStore.cameraEnabled) return
      const mode = patch.background_mode || this.backgroundMode
      if (mode === 'blur') {
        await this.voiceStore.setVirtualBackgroundImage(null)
        await this.voiceStore.setBackgroundBlurEnabled(true)
        return
      }
      if (mode === 'image') {
        const background = this.backgrounds.find((entry) => entry.id === (patch.background_image_id || this.selectedBackgroundId))
        if (!background) return
        const url = await this.ensurePreviewUrl(background)
        await this.voiceStore.setBackgroundBlurEnabled(false)
        await this.voiceStore.setVirtualBackgroundImage(url)
        return
      }
      await this.voiceStore.setBackgroundBlurEnabled(false)
      await this.voiceStore.setVirtualBackgroundImage(null)
    },
    async onUploadSelected(event) {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      try {
        const created = await this.videoBackgroundsStore.uploadBackground(file, file.name)
        await this.loadBackgrounds()
        await this.selectBackground(created)
      } catch (error) {
        console.error('Failed to upload video background:', error)
        window.$message?.error(this.$t('ui.views.video_background_upload_failed'))
      }
    },
    async generateBackground() {
      if (!this.canGenerateBackground) return
      try {
        const created = await this.videoBackgroundsStore.generateBackground(this.generationPrompt)
        this.generationPrompt = ''
        await this.loadBackgrounds()
        await this.selectBackground(created)
      } catch (error) {
        console.error('Failed to generate video background:', error)
        window.$message?.error(this.$t('ui.views.video_background_generate_failed'))
      }
    },
    async publishSelectedBackground() {
      if (!this.selectedBackground) return
      await this.videoBackgroundsStore.updateBackground(this.selectedBackground.id, { is_global: true })
      await this.loadBackgrounds()
    },
    async unpublishSelectedBackground() {
      if (!this.selectedBackground) return
      await this.videoBackgroundsStore.updateBackground(this.selectedBackground.id, { is_global: false })
      await this.loadBackgrounds()
    },
    async deleteSelectedBackground() {
      if (!this.selectedBackground) return
      const deletedId = this.selectedBackground.id
      await this.videoBackgroundsStore.deleteBackground(deletedId)
      await this.loadBackgrounds()
      if (this.selectedBackgroundId === deletedId) {
        await this.saveBackgroundPreference({ background_mode: 'none', background_image_id: null })
      }
    }
  }
}
</script>

<style scoped>
.video-settings-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
  gap: 20px;
}

.video-preview-panel,
.video-settings-form {
  min-width: 0;
}

.video-preview-label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  opacity: 0.72;
}

.video-preview-frame {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  border-radius: 8px;
}

.video-preview-frame video {
 width: 100%;
 height: 100%;
 object-fit: cover;
 display: block;
}

.video-preview-frame video.mirrored {
 transform: scaleX(-1);
}

.video-preview-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-size: 13px;
  text-align: center;
  background: var(--app-surface);
}

.video-settings-field {
 width: 100%;
 display: flex;
 flex-direction: column;
 gap: 10px;
}

.video-settings-toggle-row {
 display: grid;
 grid-template-columns: auto minmax(0, 1fr);
 gap: 10px;
 align-items: center;
}

.setting-hint {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.68;
}

.video-background-mode-control {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
}

.video-background-mode-button {
  min-width: 0;
  height: 34px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.video-background-mode-button:hover:not(:disabled),
.video-background-mode-button.selected {
  border-color: var(--theme-primary);
  background: color-mix(in srgb, var(--theme-primary) 14%, transparent);
}

.video-background-mode-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.video-background-toolbar,
.video-background-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.video-generate-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: start;
}

.video-background-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}

.video-background-item {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface-muted);
  cursor: pointer;
  padding: 0;
}

.video-background-item.selected {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-primary) 30%, transparent);
}

.video-background-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-background-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.video-background-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  max-width: calc(100% - 12px);
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 760px) {
  .video-settings-layout,
  .video-generate-row {
    grid-template-columns: 1fr;
  }

  .video-background-mode-control {
    grid-template-columns: 1fr;
  }
}
</style>
