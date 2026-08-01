<template>
  <div
    class="transcription-recording-banner"
    :class="bannerClasses"
    data-testid="meeting-transcription-recording-banner"
  >
    <div v-if="hasRecording" class="transcription-recording-chip">
      <span class="transcription-recording-dot"></span>
      <span class="transcription-recording-title">{{ transcriptionRecordingTitle }}</span>
      <n-popover trigger="click" placement="bottom-start">
        <template #trigger>
          <n-button
            text
            size="tiny"
            class="transcription-recording-info-trigger"
            :aria-label="$t('ui.components.transcription_status_details')"
            data-testid="meeting-transcription-recording-info"
          >
            <template #icon>
              <n-icon size="14"><information-icon /></n-icon>
            </template>
          </n-button>
        </template>
        <div class="transcription-recording-popover">
          <span class="transcription-recording-detail">{{ transcriptionRecordingDetail }}</span>
          <n-space
            v-if="canControlTranscriptionRecording"
            :size="6"
            align="center"
            class="transcription-recording-actions"
          >
            <n-button
              v-if="recording.can_pause"
              size="small"
              secondary
              type="warning"
              :loading="loading"
              data-testid="meeting-transcription-recording-pause"
              @click="$emit('pause-recording')"
            >
              {{ $t('ui.views.pause_transcription_recording') }}
            </n-button>
            <n-button
              v-if="recording.can_resume"
              size="small"
              secondary
              type="primary"
              :loading="loading"
              data-testid="meeting-transcription-recording-resume"
              @click="$emit('resume-recording')"
            >
              {{ $t('ui.views.resume_transcription_recording') }}
            </n-button>
          </n-space>
        </div>
      </n-popover>
    </div>

    <span v-else-if="showVideoRestore" class="transcription-recording-video-label">
      {{ $t('ui.views.meeting_video_hidden_compact') }}
    </span>

    <n-button
      v-if="showVideoRestore"
      size="tiny"
      secondary
      data-testid="meeting-video-show"
      @click="$emit('show-videos')"
    >
      {{ $t('ui.views.show_meeting_video') }}
    </n-button>
  </div>
</template>

<script>
import { InformationCircleOutline as InformationIcon } from '@vicons/ionicons5'

export default {
  name: 'TranscriptionRecordingBanner',
  components: {
    InformationIcon
  },
  props: {
    recording: {
      type: Object,
      default: null
    },
    loading: {
      type: Boolean,
      default: false
    },
    showVideoRestore: {
      type: Boolean,
      default: false
    }
  },
  emits: ['pause-recording', 'resume-recording', 'show-videos'],
  computed: {
    hasRecording() {
      return !!this.recording
    },
    bannerClasses() {
      return this.hasRecording ? [`state-${this.recording.status}`] : ['state-idle']
    },
    canControlTranscriptionRecording() {
      return !!this.recording && (this.recording.can_pause || this.recording.can_resume)
    },
    transcriptionRecordingTitle() {
      if (this.recording.status === 'paused') {
        return this.$t('ui.views.transcription_recording_paused')
      }
      if (this.recording.status === 'recording') {
        return this.$t('ui.views.transcription_recording_active')
      }
      if (this.recording.status === 'starting') {
        return this.$t('ui.views.transcription_recording_starting')
      }
      return this.$t('ui.views.transcription_recording_ready')
    },
    transcriptionRecordingDetail() {
      if (this.recording.status === 'paused') {
        return this.$t('ui.views.transcription_recording_paused_detail')
      }
      if (this.recording.status === 'recording') {
        return this.$t('ui.views.transcription_recording_active_detail', {
          count: this.recording.active_recording_count || 0
        })
      }
      if (this.recording.status === 'starting') {
        return this.$t('ui.views.transcription_recording_starting_detail')
      }
      return this.$t('ui.views.transcription_recording_ready_detail')
    }
  }
}
</script>

<style scoped>
.transcription-recording-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 6px 16px 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.transcription-recording-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
}

.transcription-recording-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(99, 226, 183);
  flex-shrink: 0;
}

.transcription-recording-banner.state-paused .transcription-recording-dot {
  background: rgb(250, 173, 20);
}

.transcription-recording-title,
.transcription-recording-video-label {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.84);
}

.transcription-recording-info-trigger {
  padding: 0;
  min-width: auto;
  color: rgba(255, 255, 255, 0.58);
}

.transcription-recording-info-trigger:hover,
.transcription-recording-info-trigger:focus-visible {
  color: rgba(255, 255, 255, 0.82);
}

.transcription-recording-popover {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 280px;
}

.transcription-recording-detail {
  font-size: 12px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.82);
  overflow-wrap: anywhere;
}

.transcription-recording-actions {
  justify-content: flex-start;
}

@media (max-width: 900px) {
  .transcription-recording-banner {
    padding: 6px 12px 0;
  }
}
</style>
