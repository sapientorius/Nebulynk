<template>
  <div class="transcript-panel" :class="{ 'transcript-panel-compact': compactHeader }" data-testid="meeting-transcript-panel">
    <div v-if="!compactHeader" class="transcript-header">
      <span class="transcript-title">{{ $t('ui.views.transcript') }}</span>
      <n-space align="center" :size="8">
        <n-tag v-if="transcriptArtifact.payload?.language" size="small">
          {{ transcriptArtifact.payload.language }}
        </n-tag>
        <n-tag
          v-if="transcriptArtifact.payload?.completeness"
          size="small"
          :type="transcriptCompletenessType(transcriptArtifact.payload.completeness)"
        >
          {{
            transcriptArtifact.payload.completeness === 'partial'
              ? $t('ui.views.transcript_completeness_partial')
              : $t('ui.views.transcript_completeness_complete')
          }}
        </n-tag>
        <n-button
          v-if="showTranscriptGenerationButton"
          size="tiny"
          :disabled="!canTriggerTranscriptGeneration"
          :loading="generating"
          data-testid="meeting-transcript-generate"
          @click="$emit('generate-transcript')"
        >
          {{ transcriptGenerationButtonLabel }}
        </n-button>
      </n-space>
    </div>

    <n-space
      v-else-if="transcriptArtifact.payload?.language || transcriptArtifact.payload?.completeness || showTranscriptGenerationButton"
      align="center"
      :size="8"
      class="transcript-compact-actions"
      data-testid="meeting-transcript-compact-actions"
    >
      <n-tag v-if="transcriptArtifact.payload?.language" size="small">
        {{ transcriptArtifact.payload.language }}
      </n-tag>
      <n-tag
        v-if="transcriptArtifact.payload?.completeness"
        size="small"
        :type="transcriptCompletenessType(transcriptArtifact.payload.completeness)"
      >
        {{
          transcriptArtifact.payload.completeness === 'partial'
            ? $t('ui.views.transcript_completeness_partial')
            : $t('ui.views.transcript_completeness_complete')
        }}
      </n-tag>
      <n-button
        v-if="showTranscriptGenerationButton"
        size="tiny"
        :disabled="!canTriggerTranscriptGeneration"
        :loading="generating"
        data-testid="meeting-transcript-generate"
        @click="$emit('generate-transcript')"
      >
        {{ transcriptGenerationButtonLabel }}
      </n-button>
    </n-space>

    <div
      v-if="transcriptArtifact.status === 'ready' && transcriptSegments.length > 0"
      class="transcript-segments"
      data-testid="meeting-transcript-text"
    >
      <div
        v-for="segment in transcriptSegments"
        :key="`${segment.start_ms}-${segment.speaker_user_id || segment.speaker_label}`"
        :ref="`transcript-segment-${segment.start_ms}`"
        class="transcript-segment"
        :class="{ 'transcript-segment-highlighted': isHighlightedTranscriptSegment(segment) }"
        :data-transcript-start-ms="segment.start_ms"
      >
        <div class="transcript-segment-meta">
          <span class="transcript-segment-speaker">{{ segment.speaker_label }}</span>
          <n-button text size="tiny" @click="$emit('open-evidence', segment)">
            {{ formatTranscriptTimestamp(segment.start_ms) }}
          </n-button>
        </div>
        <div class="transcript-segment-text">{{ segment.text }}</div>
      </div>
    </div>

    <div
      v-else-if="transcriptArtifact.status === 'ready' && transcriptArtifact.payload?.text"
      class="transcript-body"
      data-testid="meeting-transcript-text"
    >
      {{ transcriptArtifact.payload.text }}
    </div>

    <div
      v-else-if="transcriptArtifact.status === 'failed'"
      class="transcript-error"
      data-testid="meeting-transcript-error"
    >
      {{ $t('ui.views.transcript_failed') }}
    </div>

    <div v-else class="transcript-state">
      {{ transcriptStatusLabel(transcriptArtifact.status) }}
    </div>

    <div
      v-if="transcriptGenerationHint"
      class="transcript-state transcript-generation-hint"
      data-testid="meeting-transcript-generation-hint"
    >
      {{ transcriptGenerationHint }}
    </div>

    <div v-if="transcriptWarnings.length > 0" class="transcript-warnings">
      <div class="transcript-warning-title">{{ $t('ui.views.transcript_warnings') }}</div>
      <div
        v-for="warning in transcriptWarnings"
        :key="`${warning.recording_id || warning.code}-${warning.speaker_user_id || 'unknown'}`"
        class="transcript-warning"
        data-testid="meeting-transcript-warning"
      >
        {{ warning.speaker_label ? `${warning.speaker_label}: ` : '' }}{{ warning.message }}
      </div>
    </div>
  </div>
</template>

<script>
import { formatTranscriptTimestamp } from '../lib/meeting-artifact-format.js'

export default {
  name: 'MeetingTranscriptPanel',
  props: {
    transcriptArtifact: {
      type: Object,
      required: true
    },
    transcriptGeneration: {
      type: Object,
      default: null
    },
    generating: {
      type: Boolean,
      default: false
    },
    compactHeader: {
      type: Boolean,
      default: false
    },
    highlightedStartMs: {
      type: Number,
      default: null
    }
  },
  emits: ['generate-transcript', 'open-evidence'],
  computed: {
    transcriptGenerationAction() {
      return this.transcriptGeneration?.action || null
    },
    showTranscriptGenerationButton() {
      if (!this.transcriptGenerationAction) return false
      if (this.transcriptGeneration?.reason === 'retry_forbidden') return false
      return this.transcriptArtifact?.status !== 'processing'
    },
    canTriggerTranscriptGeneration() {
      return !!this.transcriptGeneration?.allowed
    },
    transcriptGenerationButtonLabel() {
      return this.$t('ui.views.retry_transcript')
    },
    transcriptGenerationHint() {
      if (this.transcriptGeneration?.reason === 'missing_runtime') {
        return this.$t('ui.views.transcript_generation_missing_runtime')
      }
      if (this.transcriptGeneration?.reason === 'retry_forbidden') {
        return this.$t('ui.views.transcript_retry_forbidden')
      }
      if (this.transcriptGeneration?.reason === 'no_retryable_recordings') {
        return this.$t('ui.views.transcript_generation_no_retryable_recordings')
      }
      return ''
    },
    transcriptSegments() {
      return Array.isArray(this.transcriptArtifact?.payload?.segments)
        ? this.transcriptArtifact.payload.segments
        : []
    },
    highlightedTranscriptSegment() {
      if (!Number.isFinite(this.highlightedStartMs)) return null
      if (!this.transcriptSegments.length) return null

      return this.transcriptSegments.reduce((closest, segment) => {
        const distance = Math.abs(Number(segment?.start_ms || 0) - this.highlightedStartMs)
        if (!closest) {
          return { segment, distance }
        }
        return distance < closest.distance ? { segment, distance } : closest
      }, null)?.segment || null
    },
    transcriptWarnings() {
      return Array.isArray(this.transcriptArtifact?.payload?.warnings)
        ? this.transcriptArtifact.payload.warnings
        : []
    }
  },
  watch: {
    highlightedStartMs() {
      this.$nextTick(() => {
        this.scrollHighlightedIntoView()
      })
    },
    transcriptSegments() {
      this.$nextTick(() => {
        this.scrollHighlightedIntoView()
      })
    }
  },
  methods: {
    formatTranscriptTimestamp,
    scrollHighlightedIntoView() {
      const segment = this.highlightedTranscriptSegment
      if (!segment) return

      const refName = `transcript-segment-${segment.start_ms}`
      const target = this.$refs[refName]
      const element = Array.isArray(target) ? target[0] : target
      element?.scrollIntoView?.({
        block: 'center',
        behavior: 'smooth'
      })
    },
    isHighlightedTranscriptSegment(segment) {
      return !!this.highlightedTranscriptSegment && this.highlightedTranscriptSegment.start_ms === segment?.start_ms
    },
    transcriptCompletenessType(completeness) {
      return completeness === 'partial' ? 'warning' : 'success'
    },
    transcriptStatusLabel(status) {
      if (status === 'pending') return this.$t('ui.views.transcript_pending')
      if (status === 'processing') return this.$t('ui.views.transcript_processing')
      if (status === 'failed') return this.$t('ui.views.transcript_failed')
      return this.$t('ui.views.transcript_pending')
    }
  }
}
</script>

<style scoped>
.transcript-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transcript-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.transcript-title,
.transcript-warning-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.82;
  text-transform: uppercase;
}

.transcript-body,
.transcript-state,
.transcript-error,
.transcript-warning {
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 13px;
}

.transcript-body {
  max-height: 220px;
  overflow-y: auto;
  padding: 12px;
  border-radius: 12px;
  background: var(--app-surface-muted);
}

.transcript-state {
  opacity: 0.72;
}

.transcript-error {
  color: #f0a9a9;
}

.transcript-segments {
  max-height: 260px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transcript-segment {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface-muted);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.transcript-segment-highlighted {
  outline: 1px solid var(--app-focus);
  background: var(--app-primary-soft);
}

.transcript-segment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.transcript-segment-speaker {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.85;
}

.transcript-segment-text {
  line-height: 1.45;
  font-size: 13px;
}

.transcript-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.transcript-compact-actions {
  flex-wrap: wrap;
}

.transcript-warning {
  color: rgba(255, 216, 133, 0.92);
}

:global(.artifact-hub-body) .transcript-panel {
  margin-top: 0;
}

.transcript-panel-compact {
  gap: 8px;
}

@media (max-width: 900px) {
  .transcript-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
