<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    style="max-width: 420px"
    @update:show="onModalShowChange"
  >
    <div class="voice-recorder" data-testid="voice-recorder">
      <n-alert v-if="error" type="error" :show-icon="false">
        {{ error }}
      </n-alert>

      <div class="voice-recorder-status">
        <n-icon size="22"><mic-icon /></n-icon>
        <span>{{ statusLabel }}</span>
      </div>

      <div
        v-if="recording"
        class="voice-recording-sphere"
        data-testid="voice-recording-sphere"
        aria-hidden="true"
      >
        <span class="voice-recording-sphere-core"></span>
      </div>

      <CustomAudioPlayer
        v-if="audioUrl"
        :src="audioUrl"
        :duration-ms="durationMs"
        class="voice-recorder-preview"
        data-testid="voice-recorder-preview"
      />

      <div class="voice-recorder-actions">
        <n-button
          v-if="!recording && !audioFile"
          type="primary"
          data-testid="voice-recorder-start"
          @click="startRecording"
        >
          {{ $t('ui.components.voice_record_start') }}
        </n-button>
        <n-button
          v-if="recording"
          type="error"
          data-testid="voice-recorder-stop"
          @click="stopRecording"
        >
          {{ $t('ui.components.voice_record_stop') }}
        </n-button>
        <n-button
          v-if="audioFile && !recording"
          secondary
          data-testid="voice-recorder-rerecord"
          @click="resetRecording"
        >
          {{ $t('ui.components.voice_record_again') }}
        </n-button>
      </div>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button data-testid="voice-recorder-cancel" @click="close">
          {{ $t('common.cancel') }}
        </n-button>
        <n-button
          type="primary"
          :disabled="!audioFile"
          :loading="loading"
          data-testid="voice-recorder-submit"
          @click="submit"
        >
          {{ actionLabel }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script>
import { MicOutline as MicIcon } from '@vicons/ionicons5'
import CustomAudioPlayer from './CustomAudioPlayer.vue'

function getPreferredMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ]

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || ''
}

function getFileExtension(mimeType) {
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  return 'webm'
}

export default {
  name: 'VoiceRecorder',
  components: { MicIcon, CustomAudioPlayer },
  props: {
    show: { type: Boolean, default: false },
    mode: { type: String, default: 'voice-message' },
    loading: { type: Boolean, default: false }
  },
  emits: ['update:show', 'submit'],
  data() {
    return {
      recording: false,
      mediaRecorder: null,
      stream: null,
      chunks: [],
      startedAt: null,
      durationMs: null,
      audioFile: null,
      audioUrl: null,
      error: null
    }
  },
  computed: {
    isVoiceToText() {
      return this.mode === 'voice-to-text'
    },
    title() {
      return this.isVoiceToText
        ? this.$t('ui.components.voice_to_text')
        : this.$t('ui.components.voice_message')
    },
    actionLabel() {
      return this.isVoiceToText
        ? this.$t('ui.components.insert_text')
        : this.$t('ui.components.send_voice_message')
    },
    statusLabel() {
      if (this.recording) return this.$t('ui.components.recording')
      if (this.audioFile) return this.$t('ui.components.voice_preview_ready')
      return this.$t('ui.components.voice_record_ready')
    }
  },
  watch: {
    show(nextShow, previousShow) {
      if (nextShow && !previousShow) {
        this.resetRecording()
        this.$nextTick(() => {
          if (this.show && !this.recording && !this.audioFile) {
            this.startRecording()
          }
        })
      } else if (!nextShow && previousShow) {
        this.cleanup()
      }
    }
  },
  beforeUnmount() {
    this.cleanup()
  },
  methods: {
    onModalShowChange(nextShow) {
      if (!nextShow) {
        this.close()
      }
    },
    async startRecording() {
      if (this.recording) return
      this.error = null

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        this.error = this.$t('ui.components.voice_recording_unavailable')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!this.show) {
          for (const track of stream?.getTracks?.() || []) {
            track.stop()
          }
          return
        }
        this.stream = stream
        const mimeType = getPreferredMimeType()
        this.mediaRecorder = new MediaRecorder(
          this.stream,
          mimeType ? { mimeType } : undefined
        )
        this.chunks = []
        this.startedAt = Date.now()
        this.durationMs = null
        this.audioFile = null
        this.revokeAudioUrl()

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data?.size > 0) {
            this.chunks.push(event.data)
          }
        }
        this.mediaRecorder.onstop = this.onRecordingStopped
        this.mediaRecorder.start()
        this.recording = true
      } catch {
        this.cleanupStream()
        this.error = this.$t('ui.components.permission_not_granted')
      }
    },
    stopRecording() {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return
      this.durationMs = this.startedAt ? Date.now() - this.startedAt : null
      this.mediaRecorder.stop()
    },
    onRecordingStopped() {
      this.recording = false
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm'
      this.cleanupStream()

      if (this.chunks.length === 0) {
        this.error = this.$t('ui.components.voice_recording_empty')
        return
      }

      const blob = new Blob(this.chunks, { type: mimeType })
      const extension = getFileExtension(mimeType)
      this.audioFile = new File([blob], `voice-message-${Date.now()}.${extension}`, { type: mimeType })
      this.audioUrl = URL.createObjectURL(blob)
      this.mediaRecorder = null
    },
    resetRecording() {
      this.audioFile = null
      this.durationMs = null
      this.chunks = []
      this.error = null
      this.revokeAudioUrl()
    },
    submit() {
      if (!this.audioFile) return
      this.$emit('submit', {
        file: this.audioFile,
        durationMs: this.durationMs,
        mode: this.mode
      })
    },
    close() {
      this.cleanup()
      this.$emit('update:show', false)
    },
    cleanup() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = null
        this.mediaRecorder.stop()
      }
      this.recording = false
      this.mediaRecorder = null
      this.cleanupStream()
      this.resetRecording()
    },
    cleanupStream() {
      for (const track of this.stream?.getTracks?.() || []) {
        track.stop()
      }
      this.stream = null
    },
    revokeAudioUrl() {
      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl)
      }
      this.audioUrl = null
    }
  }
}
</script>

<style scoped>
.voice-recorder {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.voice-recorder-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}

.voice-recorder-preview {
  width: 100%;
}

.voice-recording-sphere {
  position: relative;
  align-self: center;
  width: 122px;
  height: 122px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 42% 40%, rgba(111, 236, 195, 0.64) 0, rgba(88, 215, 177, 0.32) 24%, rgba(44, 142, 124, 0.18) 48%, rgba(12, 22, 25, 0.06) 72%),
    radial-gradient(circle at 50% 50%, rgba(99, 226, 183, 0.18), rgba(6, 12, 15, 0) 68%);
  box-shadow:
    0 0 0 1px rgba(99, 226, 183, 0.08),
    0 18px 52px rgba(47, 171, 142, 0.14);
  overflow: hidden;
  animation: voice-sphere-breathe 2.8s ease-in-out infinite;
}

.voice-recording-sphere::before,
.voice-recording-sphere::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  border: 1px solid rgba(135, 246, 211, 0.16);
  filter: blur(0.2px);
  animation: voice-sphere-ring 3.4s ease-out infinite;
}

.voice-recording-sphere::after {
  inset: 26px;
  border-color: rgba(135, 246, 211, 0.11);
  animation-delay: 0.75s;
}

.voice-recording-sphere-core {
  position: absolute;
  inset: 42px;
  border-radius: 50%;
  background: rgba(99, 226, 183, 0.82);
  box-shadow:
    0 0 22px rgba(99, 226, 183, 0.44),
    0 0 54px rgba(42, 160, 137, 0.2);
  animation: voice-sphere-drift 4.8s ease-in-out infinite;
}

@keyframes voice-sphere-breathe {
  0%,
  100% {
    transform: scale(0.96);
    box-shadow:
      0 0 0 1px rgba(99, 226, 183, 0.06),
      0 18px 44px rgba(47, 171, 142, 0.11);
  }

  50% {
    transform: scale(1.01);
    box-shadow:
      0 0 0 1px rgba(99, 226, 183, 0.14),
      0 22px 58px rgba(47, 171, 142, 0.18);
  }
}

@keyframes voice-sphere-ring {
  0% {
    opacity: 0.44;
    transform: scale(0.74) rotate(0deg);
  }

  100% {
    opacity: 0;
    transform: scale(1.42) rotate(28deg);
  }
}

@keyframes voice-sphere-drift {
  0%,
  100% {
    transform: translate(-2px, 1px) scale(0.96);
    opacity: 0.78;
  }

  50% {
    transform: translate(2px, -1px) scale(1.03);
    opacity: 0.94;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-recording-sphere,
  .voice-recording-sphere::before,
  .voice-recording-sphere::after,
  .voice-recording-sphere-core {
    animation: none;
  }
}

.voice-recorder-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
