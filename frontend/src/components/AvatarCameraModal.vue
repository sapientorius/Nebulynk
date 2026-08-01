<template>
  <n-modal :show="show" @update:show="handleShowUpdate">
    <n-card :title="$t('profile.cameraTitle')" closable style="max-width: 560px; width: 100%" @close="close">
      <div class="avatar-camera">
        <n-alert v-if="errorMessage" type="error" data-testid="profile-avatar-camera-error">
          {{ errorMessage }}
        </n-alert>

        <div class="avatar-camera-preview" :class="{ loading }">
          <video
            ref="videoEl"
            class="avatar-camera-video"
            autoplay
            muted
            playsinline
            data-testid="profile-avatar-camera-video"
          />
          <n-spin v-if="loading" class="avatar-camera-spinner" />
        </div>

        <n-form-item v-if="cameraOptions.length > 1" :label="$t('profile.labels.camera')">
          <n-select
            :value="selectedDeviceId"
            :options="cameraOptions"
            :disabled="loading || capturing"
            data-testid="profile-avatar-camera-select"
            @update:value="changeCamera"
          />
        </n-form-item>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="close">{{ $t('common.cancel') }}</n-button>
          <n-button
            type="primary"
            :loading="capturing"
            :disabled="!stream || loading"
            data-testid="profile-avatar-camera-capture"
            @click="capture"
          >
            {{ $t('profile.buttons.captureAvatar') }}
          </n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import {
  captureAvatarCameraFrame,
  getAvatarCameraErrorKey,
  listAvatarVideoDevices,
  startAvatarCameraStream,
  stopCameraStream
} from '../lib/avatar-camera.js'

export default {
  name: 'AvatarCameraModal',
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:show', 'capture'],
  data() {
    return {
      loading: false,
      capturing: false,
      stream: null,
      cameraOptions: [],
      selectedDeviceId: null,
      errorKey: null
    }
  },
  computed: {
    errorMessage() {
      return this.errorKey ? this.$t(this.errorKey) : ''
    }
  },
  watch: {
    show: {
      immediate: true,
      handler(value) {
        if (value) {
          this.startCamera()
          return
        }
        this.resetCameraState()
      }
    }
  },
  methods: {
    handleShowUpdate(value) {
      if (!value) {
        this.close()
      }
    },
    close() {
      this.$emit('update:show', false)
    },
    resetCameraState() {
      this.stopActiveStream()
      this.loading = false
      this.capturing = false
      this.errorKey = null
      this.cameraOptions = []
      this.selectedDeviceId = null
    },
    stopActiveStream() {
      stopCameraStream(this.stream)
      this.stream = null
      if (this.$refs.videoEl) {
        this.$refs.videoEl.srcObject = null
      }
    },
    async refreshDevices() {
      try {
        const devices = await listAvatarVideoDevices()
        this.cameraOptions = devices
        if (!this.selectedDeviceId && devices[0]?.value) {
          this.selectedDeviceId = devices[0].value
        }
      } catch {
        this.cameraOptions = []
      }
    },
    async startCamera() {
      this.loading = true
      this.errorKey = null
      try {
        const stream = await startAvatarCameraStream({ deviceId: this.selectedDeviceId })
        if (!this.show) {
          stopCameraStream(stream)
          return
        }

        this.stopActiveStream()
        this.stream = stream
        await this.$nextTick()

        if (this.$refs.videoEl) {
          this.$refs.videoEl.srcObject = stream
          const playResult = this.$refs.videoEl.play?.()
          if (playResult && typeof playResult.catch === 'function') {
            await playResult.catch(() => {})
          }
        }

        await this.refreshDevices()
      } catch (error) {
        this.stopActiveStream()
        this.errorKey = getAvatarCameraErrorKey(error)
        await this.refreshDevices()
      } finally {
        this.loading = false
      }
    },
    async changeCamera(deviceId) {
      if (!deviceId || deviceId === this.selectedDeviceId) return
      this.selectedDeviceId = deviceId
      this.stopActiveStream()
      await this.startCamera()
    },
    async capture() {
      if (!this.stream || !this.$refs.videoEl) return

      this.capturing = true
      this.errorKey = null
      try {
        const file = await captureAvatarCameraFrame(this.$refs.videoEl)
        this.$emit('capture', { file })
        this.close()
      } catch {
        this.errorKey = 'profile.errors.cameraUnavailable'
      } finally {
        this.capturing = false
      }
    }
  },
  beforeUnmount() {
    this.resetCameraState()
  }
}
</script>

<style scoped>
.avatar-camera {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.avatar-camera-preview {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: rgba(11, 15, 24, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.avatar-camera-preview.loading .avatar-camera-video {
  opacity: 0.4;
}

.avatar-camera-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-camera-spinner {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
</style>
