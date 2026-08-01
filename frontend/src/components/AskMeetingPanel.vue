<template>
  <div class="ask-meeting-panel" :class="{ 'ask-meeting-panel-compact': compactHeader }" data-testid="meeting-questions-panel">
    <div v-if="!compactHeader" class="summary-header">
      <span class="summary-title">{{ $t('ui.views.ask_the_meeting') }}</span>
    </div>

    <div v-if="loading" class="summary-state">
      {{ $t('ui.views.loading_meeting_questions') }}
    </div>

    <template v-else>
      <div v-if="questions.length === 0" class="summary-state">
        {{ $t('ui.views.no_meeting_questions') }}
      </div>

      <div v-for="entry in questions" :key="entry.id" class="question-answer-item">
        <div class="question-answer-question">{{ entry.question }}</div>
        <div class="question-answer-answer">{{ entry.answer }}</div>
        <n-space v-if="entry.citations?.length" :size="6" class="summary-evidence-row">
          <n-button
            v-for="(evidence, evidenceIndex) in entry.citations"
            :key="`${entry.id}-citation-${evidenceIndex}`"
            text
            size="tiny"
            class="summary-evidence-link"
            @click="$emit('open-evidence', evidence)"
          >
            {{ evidenceLabel(evidence) }}
          </n-button>
        </n-space>
      </div>

      <n-space vertical :size="10" class="ask-meeting-form">
        <n-input
          :value="question"
          type="textarea"
          :placeholder="$t('ui.views.ask_meeting_placeholder')"
          :autosize="{ minRows: 2, maxRows: 4 }"
          @update:value="$emit('update:question', $event)"
          @keydown="onQuestionKeydown"
        />
        <n-space justify="end">
          <n-button
            type="primary"
            :loading="asking"
            :disabled="!question.trim()"
            data-testid="meeting-ask-submit"
            @click="$emit('ask-question')"
          >
            {{ $t('ui.views.ask_the_meeting') }}
          </n-button>
        </n-space>
      </n-space>
    </template>
  </div>
</template>

<script>
import { formatEvidenceLabel } from '../lib/meeting-artifact-format.js'

export default {
  name: 'AskMeetingPanel',
  props: {
    questions: {
      type: Array,
      default: () => []
    },
    loading: {
      type: Boolean,
      default: false
    },
    asking: {
      type: Boolean,
      default: false
    },
    question: {
      type: String,
      default: ''
    },
    compactHeader: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:question', 'ask-question', 'open-evidence'],
  methods: {
    evidenceLabel(evidence) {
      return formatEvidenceLabel(evidence, this.$t)
    },
    onQuestionKeydown(event) {
      if (event.key !== 'Enter' || event.shiftKey) return
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      if (!this.question.trim() || this.asking) return
      this.$emit('ask-question')
    }
  }
}
</script>

<style scoped>
.ask-meeting-panel {
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

.summary-state {
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 13px;
  opacity: 0.72;
}

.summary-evidence-row {
  flex-wrap: wrap;
}

.summary-evidence-link {
  opacity: 0.85;
}

.question-answer-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}

.question-answer-question {
  font-size: 13px;
  font-weight: 600;
}

.question-answer-answer {
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.ask-meeting-form {
  margin-top: 6px;
}

:global(.artifact-hub-body) .ask-meeting-panel {
  margin-top: 0;
}

.ask-meeting-panel-compact {
  gap: 8px;
}

@media (max-width: 900px) {
  .summary-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }
}
</style>
