<template>
  <div class="file-preview">
    <template v-if="isImage">
      <n-image
        :src="file.url"
        :alt="file.original_name"
        :style="imagePreviewStyle"
        lazy
        class="file-image"
      />
      <div class="file-meta">{{ file.original_name }} — {{ formatSize(file.size) }}</div>
    </template>
    <template v-else-if="isVideo">
      <video
        :src="file.url"
        controls
        preload="metadata"
        class="file-video"
      />
      <div class="file-meta">{{ file.original_name }} — {{ formatSize(file.size) }}</div>
    </template>
    <template v-else-if="isVoiceMessage">
      <div class="voice-message-card" data-testid="voice-message-card">
        <div class="voice-message-header">
          <n-icon :size="22"><mic-icon /></n-icon>
          <div class="voice-message-title">
            <span>{{ $t('ui.components.voice_message') }}</span>
            <small>{{ voiceMetaLabel }}</small>
          </div>
        </div>
        <CustomAudioPlayer
          :src="file.url"
          :duration-ms="file.duration_ms"
          class="voice-message-audio-player"
          data-testid="voice-message-audio-player"
        />

        <div v-if="voiceArtifact?.status === 'ready'" class="voice-artifact" data-testid="voice-message-artifact-ready">
          <div v-if="voiceArtifact.summary" class="voice-artifact-block">
            <strong>{{ $t('ui.components.summary') }}</strong>
            <p>{{ voiceArtifact.summary }}</p>
          </div>
          <div v-if="voiceKeyPoints.length > 0" class="voice-artifact-block">
            <strong>{{ $t('ui.components.key_points') }}</strong>
            <ul>
              <li v-for="(point, index) in voiceKeyPoints" :key="`voice-point-${index}`">{{ point }}</li>
            </ul>
          </div>
          <details v-if="voiceArtifact.transcript" class="voice-transcript">
            <summary>{{ $t('ui.components.transcript') }}</summary>
            <p>{{ voiceArtifact.transcript }}</p>
          </details>
        </div>

        <div v-else-if="voiceArtifact?.status === 'failed'" class="voice-artifact failed" data-testid="voice-message-artifact-failed">
          {{ voiceArtifact.failure_message || $t('ui.components.voice_summary_failed') }}
        </div>

        <n-button
          v-if="voiceArtifact?.status !== 'ready'"
          size="small"
          secondary
          :loading="voiceArtifactLoading || voiceArtifact?.status === 'processing'"
          data-testid="voice-message-transcribe"
          @click="requestVoiceArtifact"
        >
          {{ voiceArtifact?.status === 'failed' ? $t('ui.components.retry') : $t('ui.components.transcribe_and_summarize') }}
        </n-button>
      </div>
    </template>
    <template v-else-if="isAudio">
      <div class="file-audio-card">
        <n-icon :size="24"><musical-note-icon /></n-icon>
        <span class="file-audio-name">{{ file.original_name }}</span>
      </div>
      <audio :src="file.url" controls preload="metadata" class="file-audio" />
    </template>
    <template v-else>
      <a :href="file.url" target="_blank" rel="noopener" class="file-card">
        <n-icon :size="28"><document-icon /></n-icon>
        <div class="file-card-info">
          <span class="file-card-name">{{ file.original_name }}</span>
          <span class="file-card-size">{{ formatSize(file.size) }}</span>
        </div>
        <n-icon :size="18"><download-icon /></n-icon>
      </a>
    </template>
  </div>
</template>

<script>
import {
  DocumentOutline as DocumentIcon,
  DownloadOutline as DownloadIcon,
  MusicalNoteOutline as MusicalNoteIcon,
  MicOutline as MicIcon
} from '@vicons/ionicons5'
import { useVoiceMessageArtifactsStore } from '../stores/index.js'
import CustomAudioPlayer from './CustomAudioPlayer.vue'

export default {
  name: 'FilePreview',
  components: { CustomAudioPlayer, DocumentIcon, DownloadIcon, MusicalNoteIcon, MicIcon },
  props: {
    file: {
      type: Object,
      required: true
    }
  },
  computed: {
    voiceMessageArtifactsStore() {
      return useVoiceMessageArtifactsStore()
    },
    isImage() {
      return this.file.mime_type?.startsWith('image/')
    },
    isVideo() {
      return this.file.mime_type?.startsWith('video/')
    },
    isAudio() {
      return this.file.mime_type?.startsWith('audio/')
    },
    isVoiceMessage() {
      return this.file.purpose === 'voice_message' && this.isAudio
    },
    previewWidth() {
      return 400
    },
    imagePreviewStyle() {
      return {
        '--file-preview-max-width': `${this.previewWidth}px`
      }
    },
    voiceArtifact() {
      return this.voiceMessageArtifactsStore.getArtifact(this.file.id) || this.file.voice_artifact || null
    },
    voiceArtifactLoading() {
      return this.voiceMessageArtifactsStore.isLoading(this.file.id)
    },
    voiceKeyPoints() {
      return Array.isArray(this.voiceArtifact?.payload?.key_points)
        ? this.voiceArtifact.payload.key_points
        : []
    },
    voiceMetaLabel() {
      const duration = this.formatDuration(this.file.duration_ms)
      return duration
        ? `${duration} - ${this.formatSize(this.file.size)}`
        : this.formatSize(this.file.size)
    }
  },
  methods: {
    formatSize(bytes) {
      if (!bytes) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let i = 0
      let size = bytes
      while (size >= 1024 && i < units.length - 1) {
        size /= 1024
        i++
      }
      return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
    },
    formatDuration(durationMs) {
      const seconds = Math.round(Number(durationMs || 0) / 1000)
      if (!Number.isFinite(seconds) || seconds <= 0) return ''
      const minutes = Math.floor(seconds / 60)
      const remainder = seconds % 60
      return `${minutes}:${String(remainder).padStart(2, '0')}`
    },
    async requestVoiceArtifact() {
      try {
        await this.voiceMessageArtifactsStore.requestArtifact({
          messageId: this.file.message_id,
          fileId: this.file.id,
          retry: this.voiceArtifact?.status === 'failed'
        })
      } catch (error) {
        console.error('Failed to request voice message artifact:', error)
        window.$message?.error(this.$t('ui.components.voice_summary_failed'))
      }
    }
  }
}
</script>

<style scoped>
.file-preview {
  margin: 4px 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.file-image {
  display: block;
  width: 100%;
  max-width: min(var(--file-preview-max-width), 100%);
  height: auto;
  box-sizing: border-box;
  border-radius: 6px;
  cursor: pointer;
}

.file-image :deep(img) {
  width: 100%;
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.file-video {
  max-width: 400px;
  max-height: 300px;
  border-radius: 6px;
  display: block;
}

.file-audio-card {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  opacity: 0.8;
}

.file-audio-name {
  font-size: 13px;
}

.file-audio {
  width: 100%;
  max-width: min(400px, 100%);
  min-width: 0;
  height: 36px;
  display: block;
}

.voice-message-audio-player {
  max-width: 100%;
  box-sizing: border-box;
}

.voice-message-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: min(460px, 100%);
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.voice-message-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.voice-message-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.voice-message-title span {
  font-weight: 600;
}

.voice-message-title span,
.voice-message-title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-message-title small {
  opacity: 0.6;
}

.voice-artifact {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.18);
  overflow-wrap: anywhere;
}

.voice-artifact.failed {
  color: #ffb4b4;
}

.voice-artifact-block p,
.voice-transcript p {
  margin: 4px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.voice-artifact-block ul {
  margin: 4px 0 0;
  padding-left: 18px;
}

.voice-transcript summary {
  cursor: pointer;
  font-weight: 600;
}

.file-meta {
  font-size: 12px;
  opacity: 0.5;
  margin-top: 2px;
}

.file-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  max-width: 400px;
  transition: background 0.15s;
}

.file-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.file-card-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.file-card-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-size {
  font-size: 12px;
  opacity: 0.5;
}
</style>
