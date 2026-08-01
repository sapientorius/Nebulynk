<template>
  <n-modal :show="show" @update:show="emitClose">
    <n-card :title="$t('profile.cropTitle')" style="max-width: 720px; width: 100%">
      <div class="avatar-cropper">
        <div class="avatar-cropper-main">
          <div
            class="avatar-cropper-viewport"
            @pointerdown="startDrag"
          >
            <img
              v-if="imageUrl"
              ref="imageEl"
              :src="imageUrl"
              class="avatar-cropper-image"
              :style="cropImageStyle"
              draggable="false"
              @load="handleImageLoad"
            />
            <div class="avatar-cropper-mask" />
          </div>

          <div class="avatar-cropper-controls">
            <span class="avatar-cropper-label">{{ $t('profile.zoomLabel') }}</span>
            <n-slider
              :value="zoom"
              :min="1"
              :max="3"
              :step="0.01"
              @update:value="updateZoom"
            />
          </div>
        </div>

        <div class="avatar-cropper-sidebar">
          <span class="avatar-cropper-label">{{ $t('profile.previewLabel') }}</span>
          <div class="avatar-cropper-preview">
            <img
              v-if="imageUrl"
              :src="imageUrl"
              class="avatar-cropper-image"
              :style="previewImageStyle"
              draggable="false"
            />
          </div>
          <p class="avatar-cropper-hint">{{ $t('profile.cropHint') }}</p>
        </div>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="emitClose">{{ $t('common.cancel') }}</n-button>
          <n-button type="primary" :disabled="!imageReady" data-testid="profile-avatar-crop-apply" @click="confirmCrop">{{ $t('profile.buttons.applyAvatar') }}</n-button>
        </n-space>
      </template>
    </n-card>
  </n-modal>
</template>

<script>
import {
  calculateAvatarCoverScale,
  computeAvatarSourceRect,
  constrainAvatarOffset
} from '../lib/avatar-crop.js'

const VIEWPORT_SIZE = 280
const PREVIEW_SIZE = 112
const OUTPUT_SIZE = 512

export default {
  name: 'AvatarCropModal',
  props: {
    show: {
      type: Boolean,
      default: false
    },
    file: {
      type: Object,
      default: null
    }
  },
  emits: ['update:show', 'confirm'],
  data() {
    return {
      imageUrl: null,
      imageWidth: 0,
      imageHeight: 0,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0
    }
  },
  computed: {
    imageReady() {
      return Boolean(this.imageUrl && this.imageWidth && this.imageHeight)
    },
    baseScale() {
      return calculateAvatarCoverScale({
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        viewportSize: VIEWPORT_SIZE
      })
    },
    actualScale() {
      return this.baseScale * this.zoom
    },
    displayWidth() {
      return this.imageWidth * this.actualScale
    },
    displayHeight() {
      return this.imageHeight * this.actualScale
    },
    cropImageStyle() {
      return this.buildImageStyle(VIEWPORT_SIZE)
    },
    previewImageStyle() {
      return this.buildImageStyle(PREVIEW_SIZE)
    }
  },
  watch: {
    show: {
      immediate: true,
      handler(value) {
        if (value) {
          this.prepareImage()
          return
        }
        this.detachPointerListeners()
        this.revokeImageUrl()
        this.imageUrl = null
      }
    },
    file() {
      if (this.show) {
        this.prepareImage()
      }
    }
  },
  methods: {
    emitClose() {
      this.$emit('update:show', false)
    },
    revokeImageUrl() {
      if (!this.imageUrl || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
      URL.revokeObjectURL(this.imageUrl)
    },
    resetCropState() {
      this.zoom = 1
      this.offsetX = 0
      this.offsetY = 0
      this.imageWidth = 0
      this.imageHeight = 0
    },
    prepareImage() {
      this.detachPointerListeners()
      this.revokeImageUrl()
      this.resetCropState()

      if (!this.file || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        this.imageUrl = null
        return
      }

      this.imageUrl = URL.createObjectURL(this.file)
    },
    handleImageLoad(event) {
      this.imageWidth = event.target.naturalWidth || 0
      this.imageHeight = event.target.naturalHeight || 0
      this.offsetX = 0
      this.offsetY = 0
      this.zoom = 1
    },
    updateZoom(value) {
      this.zoom = value
      this.applyConstrainedOffset(this.offsetX, this.offsetY)
    },
    applyConstrainedOffset(offsetX, offsetY) {
      const constrained = constrainAvatarOffset({
        offsetX,
        offsetY,
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        viewportSize: VIEWPORT_SIZE,
        scale: this.actualScale
      })

      this.offsetX = constrained.offsetX
      this.offsetY = constrained.offsetY
    },
    startDrag(event) {
      if (!this.imageReady) return

      event.preventDefault()
      this.dragging = true
      this.dragStartX = event.clientX
      this.dragStartY = event.clientY
      this.dragOffsetX = this.offsetX
      this.dragOffsetY = this.offsetY

      window.addEventListener('pointermove', this.onPointerMove)
      window.addEventListener('pointerup', this.stopDrag)
      window.addEventListener('pointercancel', this.stopDrag)
    },
    onPointerMove(event) {
      if (!this.dragging) return

      const nextOffsetX = this.dragOffsetX + (event.clientX - this.dragStartX)
      const nextOffsetY = this.dragOffsetY + (event.clientY - this.dragStartY)
      this.applyConstrainedOffset(nextOffsetX, nextOffsetY)
    },
    stopDrag() {
      this.dragging = false
      this.detachPointerListeners()
    },
    detachPointerListeners() {
      window.removeEventListener('pointermove', this.onPointerMove)
      window.removeEventListener('pointerup', this.stopDrag)
      window.removeEventListener('pointercancel', this.stopDrag)
    },
    buildImageStyle(viewportSize) {
      if (!this.imageReady) return {}

      const scaleRatio = viewportSize / VIEWPORT_SIZE
      const width = this.displayWidth * scaleRatio
      const height = this.displayHeight * scaleRatio
      const offsetX = this.offsetX * scaleRatio
      const offsetY = this.offsetY * scaleRatio

      return {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${offsetX - (width / 2)}px, ${offsetY - (height / 2)}px)`
      }
    },
    async confirmCrop() {
      if (!this.imageReady) return

      const image = this.$refs.imageEl
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE

      const context = canvas.getContext('2d')
      const sourceRect = computeAvatarSourceRect({
        imageWidth: this.imageWidth,
        imageHeight: this.imageHeight,
        viewportSize: VIEWPORT_SIZE,
        scale: this.actualScale,
        offsetX: this.offsetX,
        offsetY: this.offsetY
      })

      context.drawImage(
        image,
        sourceRect.sx,
        sourceRect.sy,
        sourceRect.sw,
        sourceRect.sh,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      )

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/webp', 0.92)
      })

      if (!blob) return

      const previewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(blob)
        : null

      const file = new File([blob], `avatar-${Date.now()}.webp`, { type: 'image/webp' })

      this.$emit('confirm', { file, previewUrl })
      this.emitClose()
    }
  },
  beforeUnmount() {
    this.detachPointerListeners()
    this.revokeImageUrl()
  }
}
</script>

<style scoped>
.avatar-cropper {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.avatar-cropper-main {
  flex: 1;
  min-width: 0;
}

.avatar-cropper-sidebar {
  width: 160px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.avatar-cropper-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.64;
}

.avatar-cropper-viewport,
.avatar-cropper-preview {
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at top, rgba(255, 255, 255, 0.12), rgba(16, 20, 28, 0.88));
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.avatar-cropper-viewport {
  width: 280px;
  height: 280px;
  border-radius: 28px;
  cursor: grab;
  touch-action: none;
}

.avatar-cropper-viewport:active {
  cursor: grabbing;
}

.avatar-cropper-preview {
  width: 112px;
  height: 112px;
  border-radius: 999px;
}

.avatar-cropper-image {
  position: absolute;
  left: 50%;
  top: 50%;
  user-select: none;
  pointer-events: none;
}

.avatar-cropper-mask {
  position: absolute;
  inset: 16px;
  border-radius: 999px;
  box-shadow: 0 0 0 999px rgba(7, 10, 18, 0.48);
  border: 2px solid rgba(255, 255, 255, 0.9);
  pointer-events: none;
}

.avatar-cropper-controls {
  margin-top: 18px;
}

.avatar-cropper-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.68;
}

@media (max-width: 720px) {
  .avatar-cropper {
    flex-direction: column;
  }

  .avatar-cropper-sidebar {
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
