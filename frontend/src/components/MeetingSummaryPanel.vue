<template>
  <div class="summary-panel" :class="{ 'summary-panel-compact': compactHeader }" data-testid="meeting-summary-panel">
    <div v-if="!compactHeader" class="summary-header">
      <span class="summary-title">{{ $t('ui.views.meeting_summary') }}</span>
      <n-space align="center" :size="8">
        <n-tag v-if="summaryLanguage" size="small">
          {{ summaryLanguage }}
        </n-tag>
        <n-tag
          v-if="summaryArtifact?.status === 'ready' && summaryCoverage"
          size="small"
          :type="summaryCoverageType"
          data-testid="meeting-summary-coverage-badge"
        >
          {{ summaryCoverageLabel }}
        </n-tag>
        <n-popover
          v-if="showShareMenuTrigger"
          v-model:show="showShareMenu"
          trigger="click"
          placement="bottom-end"
          :show-arrow="false"
        >
          <template #trigger>
            <n-button
              text
              size="tiny"
              data-testid="meeting-summary-share-trigger"
            >
              <template #icon><n-icon size="16"><share-social-icon /></n-icon></template>
              {{ $t('ui.views.share') }}
            </n-button>
          </template>

          <div class="summary-share-menu" data-testid="meeting-summary-share-menu">
            <button
              v-if="summaryArtifact?.status === 'ready' && summaryShareText"
              type="button"
              class="summary-share-menu-action"
              data-testid="meeting-summary-share-copy"
              @click="emitShareAction('copy-summary')"
            >
              <span class="summary-share-menu-label">{{ $t('ui.views.copy_summary') }}</span>
              <n-icon size="18"><copy-icon /></n-icon>
            </button>
            <button
              v-if="summaryArtifact?.status === 'ready' && summaryShareText"
              type="button"
              class="summary-share-menu-action"
              data-testid="meeting-summary-share-export"
              @click="emitShareAction('export-summary')"
            >
              <span class="summary-share-menu-label">{{ $t('ui.views.export_summary') }}</span>
              <n-icon size="18"><download-icon /></n-icon>
            </button>
            <button
              v-if="canShareInApp"
              type="button"
              class="summary-share-menu-action"
              data-testid="meeting-summary-share-in-app"
              :disabled="!summaryShareText"
              @click="emitShareAction('share-summary')"
            >
              <span class="summary-share-menu-label">{{ $t('ui.views.share_in_nebulynk') }}</span>
              <n-icon size="18"><share-social-icon /></n-icon>
            </button>
          </div>
        </n-popover>
        <n-button
          v-if="showSummaryGenerationButton"
          size="tiny"
          :disabled="!canTriggerSummaryGeneration"
          :loading="generating"
          data-testid="meeting-summary-generate"
          @click="$emit('generate-summary')"
        >
          {{ summaryGenerationButtonLabel }}
        </n-button>
      </n-space>
    </div>

    <n-space
      v-else-if="summaryLanguage || (summaryArtifact?.status === 'ready' && summaryCoverage) || summaryShareText || canShareInApp || showSummaryGenerationButton"
      align="center"
      :size="8"
      class="summary-compact-actions"
      data-testid="meeting-summary-compact-actions"
    >
      <n-tag v-if="summaryLanguage" size="small">
        {{ summaryLanguage }}
      </n-tag>
      <n-tag
        v-if="summaryArtifact?.status === 'ready' && summaryCoverage"
        size="small"
        :type="summaryCoverageType"
        data-testid="meeting-summary-coverage-badge"
      >
        {{ summaryCoverageLabel }}
      </n-tag>
      <n-popover
        v-if="showShareMenuTrigger"
        v-model:show="showShareMenu"
        trigger="click"
        placement="bottom-end"
        :show-arrow="false"
      >
        <template #trigger>
          <n-button
            text
            size="tiny"
            data-testid="meeting-summary-share-trigger"
          >
            <template #icon><n-icon size="16"><share-social-icon /></n-icon></template>
            {{ $t('ui.views.share') }}
          </n-button>
        </template>

        <div class="summary-share-menu" data-testid="meeting-summary-share-menu">
          <button
            v-if="summaryArtifact?.status === 'ready' && summaryShareText"
            type="button"
            class="summary-share-menu-action"
            data-testid="meeting-summary-share-copy"
            @click="emitShareAction('copy-summary')"
          >
            <span class="summary-share-menu-label">{{ $t('ui.views.copy_summary') }}</span>
            <n-icon size="18"><copy-icon /></n-icon>
          </button>
          <button
            v-if="summaryArtifact?.status === 'ready' && summaryShareText"
            type="button"
            class="summary-share-menu-action"
            data-testid="meeting-summary-share-export"
            @click="emitShareAction('export-summary')"
          >
            <span class="summary-share-menu-label">{{ $t('ui.views.export_summary') }}</span>
            <n-icon size="18"><download-icon /></n-icon>
          </button>
          <button
            v-if="canShareInApp"
            type="button"
            class="summary-share-menu-action"
            data-testid="meeting-summary-share-in-app"
            :disabled="!summaryShareText"
            @click="emitShareAction('share-summary')"
          >
            <span class="summary-share-menu-label">{{ $t('ui.views.share_in_nebulynk') }}</span>
            <n-icon size="18"><share-social-icon /></n-icon>
          </button>
        </div>
      </n-popover>
      <n-button
        v-if="showSummaryGenerationButton"
        size="tiny"
        :disabled="!canTriggerSummaryGeneration"
        :loading="generating"
        data-testid="meeting-summary-generate"
        @click="$emit('generate-summary')"
      >
        {{ summaryGenerationButtonLabel }}
      </n-button>
    </n-space>

    <div v-if="attendedParticipantDisplayNames.length > 0" class="summary-section">
      <div class="summary-section-title">{{ $t('ui.views.participants_attended') }}</div>
      <div class="summary-attendees">
        {{ attendedParticipantDisplayNames.join(', ') }}
      </div>
    </div>

    <template v-if="summaryArtifact?.status === 'ready' && summaryPayload">
      <div v-if="summaryPayload.mini_summary" class="summary-mini">
        {{ summaryPayload.mini_summary }}
      </div>

      <div v-if="summaryCoverageDetailText" class="summary-coverage-detail">
        {{ summaryCoverageDetailText }}
      </div>

      <div v-if="summaryPoints.length > 0" class="summary-section">
        <div class="summary-section-title">{{ $t('ui.views.summary_points') }}</div>
        <ul class="summary-list">
          <li v-for="(point, index) in summaryPoints" :key="`summary-point-${index}`">
            {{ point }}
          </li>
        </ul>
      </div>

      <div v-if="summaryDecisions.length > 0" class="summary-section">
        <div class="summary-section-title">{{ $t('ui.views.decisions') }}</div>
        <div
          v-for="decision in summaryDecisions"
          :key="decision.id"
          class="summary-item"
          data-testid="meeting-summary-decision"
        >
          <div class="summary-item-text">{{ decision.text }}</div>
          <n-space v-if="decision.evidence?.length" :size="6" class="summary-evidence-row">
            <n-button
              v-for="(evidence, evidenceIndex) in decision.evidence"
              :key="`${decision.id}-evidence-${evidenceIndex}`"
              text
              size="tiny"
              class="summary-evidence-link"
              @click="$emit('open-evidence', evidence)"
            >
              {{ evidenceLabel(evidence) }}
            </n-button>
          </n-space>
        </div>
      </div>

      <div v-if="summaryOpenItems.length > 0" class="summary-section">
        <div class="summary-section-title">{{ $t('ui.views.open_questions_risks') }}</div>
        <div
          v-for="item in summaryOpenItems"
          :key="item.id"
          class="summary-item"
          data-testid="meeting-summary-open-item"
        >
          <div class="summary-item-text">
            <n-tag size="small" :type="item.kind === 'risk' ? 'warning' : 'default'">
              {{ item.kind === 'risk' ? $t('ui.views.risk') : $t('ui.views.question') }}
            </n-tag>
            <span class="summary-item-inline-text">{{ item.text }}</span>
          </div>
          <n-space v-if="item.evidence?.length" :size="6" class="summary-evidence-row">
            <n-button
              v-for="(evidence, evidenceIndex) in item.evidence"
              :key="`${item.id}-evidence-${evidenceIndex}`"
              text
              size="tiny"
              class="summary-evidence-link"
              @click="$emit('open-evidence', evidence)"
            >
              {{ evidenceLabel(evidence) }}
            </n-button>
          </n-space>
        </div>
      </div>

      <div v-if="summaryTopicChapters.length > 0" class="summary-section">
        <div class="summary-section-title">{{ $t('ui.views.topic_chapters') }}</div>
        <div
          v-for="chapter in summaryTopicChapters"
          :key="chapter.id"
          class="summary-item"
          data-testid="meeting-summary-topic"
        >
          <div class="summary-item-text">
            <strong>{{ chapter.title }}</strong>
            <span v-if="chapter.summary" class="summary-item-inline-text">{{ chapter.summary }}</span>
          </div>
          <n-space :size="6" class="summary-evidence-row">
            <n-button
              v-if="chapter.start_ms !== null && chapter.start_ms !== undefined"
              text
              size="tiny"
              class="summary-evidence-link"
              @click="$emit('open-evidence', { type: 'transcript', start_ms: chapter.start_ms, speaker_label: chapter.title, snippet: chapter.summary })"
            >
              {{ $t('ui.views.jump_to_transcript') }} {{ formatTranscriptTimestamp(chapter.start_ms) }}
            </n-button>
            <n-button
              v-for="(evidence, evidenceIndex) in chapter.evidence || []"
              :key="`${chapter.id}-evidence-${evidenceIndex}`"
              text
              size="tiny"
              class="summary-evidence-link"
              @click="$emit('open-evidence', evidence)"
            >
              {{ evidenceLabel(evidence) }}
            </n-button>
          </n-space>
        </div>
      </div>
    </template>

    <div
      v-else-if="summaryArtifact?.status === 'failed'"
      class="summary-error"
      data-testid="meeting-summary-error"
    >
      {{ summaryArtifact.payload?.failure_message || $t('ui.views.summary_failed') }}
    </div>

    <div v-else class="summary-state">
      {{ summaryCurrentStateLabel }}
    </div>

    <div
      v-if="summaryGenerationHint"
      class="summary-state summary-generation-hint"
      data-testid="meeting-summary-generation-hint"
    >
      {{ summaryGenerationHint }}
    </div>
  </div>
</template>

<script>
import {
  CopyOutline as CopyIcon,
  DownloadOutline as DownloadIcon,
  ShareSocialOutline as ShareSocialIcon
} from '@vicons/ionicons5'
import { formatEvidenceLabel, formatTranscriptTimestamp } from '../lib/meeting-artifact-format.js'

export default {
  name: 'MeetingSummaryPanel',
  props: {
    summaryArtifact: {
      type: Object,
      default: null
    },
    summaryGeneration: {
      type: Object,
      default: null
    },
    attendedParticipantDisplayNames: {
      type: Array,
      default: () => []
    },
    loadedMeetingChatMessages: {
      type: Array,
      default: () => []
    },
    summaryShareText: {
      type: String,
      default: ''
    },
    canShareInApp: {
      type: Boolean,
      default: true
    },
    compactHeader: {
      type: Boolean,
      default: false
    },
    generating: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      showShareMenu: false
    }
  },
  emits: ['generate-summary', 'copy-summary', 'export-summary', 'share-summary', 'open-evidence'],
  computed: {
    summaryGenerationAction() {
      return this.summaryGeneration?.action || null
    },
    showShareMenuTrigger() {
      return this.canShareInApp || !!this.summaryShareText
    },
    showSummaryGenerationButton() {
      if (!this.summaryGenerationAction) return false
      if (this.summaryGeneration?.reason === 'retry_forbidden') return false
      return this.summaryArtifact?.status !== 'processing'
    },
    canTriggerSummaryGeneration() {
      return !!this.summaryGeneration?.allowed
    },
    summaryGenerationButtonLabel() {
      return this.summaryGenerationAction === 'retry'
        ? this.$t('ui.views.retry_summary')
        : this.$t('ui.views.generate_summary')
    },
    summaryCurrentStateLabel() {
      if (this.summaryArtifact) {
        return this.summaryStatusLabel(this.summaryArtifact.status)
      }
      return this.$t('ui.views.summary_not_generated')
    },
    summaryGenerationHint() {
      if (this.summaryGeneration?.reason === 'missing_runtime') {
        return this.$t('ui.views.summary_generation_missing_runtime')
      }
      if (this.summaryGeneration?.reason === 'retry_forbidden') {
        return this.$t('ui.views.summary_retry_forbidden')
      }
      return ''
    },
    summaryPayload() {
      return this.summaryArtifact?.payload && typeof this.summaryArtifact.payload === 'object'
        ? this.summaryArtifact.payload
        : null
    },
    summaryCoverage() {
      return this.summaryPayload?.coverage && typeof this.summaryPayload.coverage === 'object'
        ? this.summaryPayload.coverage
        : null
    },
    summaryChatMessageCount() {
      const storedCount = Number(this.summaryCoverage?.chat_message_count)
      if (storedCount > 0) return storedCount
      return this.loadedMeetingChatMessages.length
    },
    summaryChatAuthorCount() {
      const storedCount = Number(this.summaryCoverage?.chat_author_count)
      if (storedCount > 0) return storedCount
      return new Set(this.loadedMeetingChatMessages.map((message) => message.user_id).filter(Boolean)).size
    },
    summaryCoverageDetailText() {
      if (!this.summaryCoverage) return ''

      const basis = this.summaryCoverage.basis || []
      const hasTranscript = basis.includes('transcript')
      const hasChat = basis.includes('chat')
      const hasFailedTranscript = this.summaryCoverage.transcript_status === 'failed'
      const hasPartialTranscript = this.summaryCoverage.transcript_completeness === 'partial'

      if ((hasFailedTranscript || !hasTranscript) && hasChat) {
        return this.$t('ui.views.coverage_sources_chat_only', {
          messages: this.summaryChatMessageCount,
          authors: this.summaryChatAuthorCount
        })
      }

      if (hasTranscript && hasPartialTranscript) {
        return this.$t('ui.views.coverage_sources_partial', {
          messages: this.summaryChatMessageCount,
          authors: this.summaryChatAuthorCount,
          warnings: this.summaryCoverage.transcript_warning_count || 0
        })
      }

      return ''
    },
    summaryLanguage() {
      return this.summaryPayload?.language || null
    },
    summaryPoints() {
      return Array.isArray(this.summaryPayload?.summary_points)
        ? this.summaryPayload.summary_points
        : []
    },
    summaryDecisions() {
      return Array.isArray(this.summaryPayload?.decisions)
        ? this.summaryPayload.decisions
        : []
    },
    summaryOpenItems() {
      return Array.isArray(this.summaryPayload?.open_items)
        ? this.summaryPayload.open_items
        : []
    },
    summaryTopicChapters() {
      return Array.isArray(this.summaryPayload?.topic_chapters)
        ? this.summaryPayload.topic_chapters
        : []
    },
    summaryCoverageType() {
      if (this.summaryCoverage?.transcript_status === 'failed') return 'warning'
      if (this.summaryCoverage?.transcript_completeness === 'partial') return 'warning'
      if ((this.summaryCoverage?.basis || []).includes('transcript')) return 'success'
      if ((this.summaryCoverage?.basis || []).includes('chat')) return 'info'
      return 'default'
    },
    summaryCoverageLabel() {
      const basis = this.summaryCoverage?.basis || []
      if (basis.includes('transcript') && this.summaryCoverage?.transcript_completeness === 'partial') {
        return this.$t('ui.views.coverage_partial')
      }
      if (basis.includes('transcript')) {
        return this.$t('ui.views.coverage_transcript_chat')
      }
      if (basis.includes('chat')) {
        return this.$t('ui.views.coverage_chat_only')
      }
      return this.$t('ui.views.coverage_pending')
    }
  },
  methods: {
    formatTranscriptTimestamp,
    emitShareAction(eventName) {
      this.showShareMenu = false
      this.$emit(eventName)
    },
    evidenceLabel(evidence) {
      return formatEvidenceLabel(evidence, this.$t)
    },
    summaryStatusLabel(status) {
      if (status === 'pending') return this.$t('ui.views.summary_pending')
      if (status === 'processing') return this.$t('ui.views.summary_processing')
      if (status === 'failed') return this.$t('ui.views.summary_failed')
      return this.$t('ui.views.summary_pending')
    }
  }
}
</script>

<style scoped>
.summary-panel {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.summary-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.82;
  text-transform: uppercase;
}

.summary-mini,
.summary-attendees,
.summary-state,
.summary-error {
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 13px;
}

.summary-mini {
  max-height: 220px;
  overflow-y: auto;
  padding: 12px;
  border-radius: 12px;
  background: var(--app-surface-muted);
}

.summary-state {
  opacity: 0.72;
}

.summary-error {
  color: #f0a9a9;
}

.summary-coverage-detail {
  font-size: 12px;
  opacity: 0.72;
}

.summary-attendees {
  opacity: 0.82;
}

.summary-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-compact-actions {
  flex-wrap: wrap;
}

.summary-share-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
  padding: 4px;
}

.summary-share-menu-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 35px;
  padding: 0 10px 0 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}

.summary-share-menu-action:hover {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.summary-share-menu-action:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.summary-share-menu-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.summary-share-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.summary-section-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  opacity: 0.8;
  text-transform: uppercase;
}

.summary-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.45;
  font-size: 13px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--app-surface);
}

.summary-item-text {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.45;
  font-size: 13px;
}

.summary-item-inline-text {
  flex: 1;
}

.summary-evidence-row {
  flex-wrap: wrap;
}

.summary-evidence-link {
  opacity: 0.85;
}

:global(.artifact-hub-body) .summary-panel {
  margin-top: 0;
}

.summary-panel-compact {
  gap: 8px;
}

@media (max-width: 900px) {
  .summary-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
