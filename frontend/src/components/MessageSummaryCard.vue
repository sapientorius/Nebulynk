<template>
  <div class="message-summary-card" data-testid="message-summary-card">
    <div class="summary-avatar">
      <n-icon size="18"><sparkles-icon /></n-icon>
    </div>
    <div class="summary-body">
      <div class="summary-header">
        <span class="summary-author">ai</span>
        <span class="summary-time">{{ summaryTimeLabel }}</span>
        <n-tag size="small" type="info">{{ $t('ui.components.private') }}</n-tag>
        <button
          class="summary-delete"
          :title="$t('ui.components.delete_summary')"
          data-testid="message-summary-delete"
          @click="$emit('remove', summary)"
        >
          <n-icon size="14"><trash-icon /></n-icon>
        </button>
      </div>

      <div class="summary-shell" :class="{ failed: summary.status === 'failed' }">
        <div class="summary-title">{{ title }}</div>
        <div v-if="summary.status === 'processing'" class="summary-state">
          {{ $t('ui.components.summary_processing') }}
        </div>
        <div v-else-if="summary.status === 'failed'" class="summary-state">
          {{ summary.failure_message || $t('ui.components.summary_failed') }}
        </div>
        <template v-else>
          <p v-if="miniSummary" class="summary-mini">{{ miniSummary }}</p>
          <ul v-if="summaryPoints.length > 0" class="summary-points">
            <li v-for="(point, index) in summaryPoints" :key="`summary-point-${summary.id}-${index}`">
              {{ point }}
            </li>
          </ul>
          <div class="summary-meta">
            {{ $t('ui.components.summary_source_count', { count: summary.message_count || 0 }) }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import {
  SparklesOutline as SparklesIcon,
  TrashOutline as TrashIcon
} from '@vicons/ionicons5'
import { getCurrentLocale } from '../lib/i18n.js'
import { formatSummaryTimeLabel } from '../lib/message-summaries.js'

export default {
  name: 'MessageSummaryCard',
  components: { SparklesIcon, TrashIcon },
  props: {
    summary: { type: Object, required: true }
  },
  emits: ['remove'],
  computed: {
    title() {
      const labels = {
        message: this.$t('ui.components.message_summary'),
        selection: this.$t('ui.components.selected_messages_summary'),
        range: this.$t('ui.components.channel_summary')
      }
      return labels[this.summary.scope] || this.$t('ui.components.summary')
    },
    payload() {
      return this.summary.payload && typeof this.summary.payload === 'object'
        ? this.summary.payload
        : {}
    },
    miniSummary() {
      return this.payload.mini_summary || this.summary.summary || ''
    },
    summaryPoints() {
      return Array.isArray(this.payload.summary_points) ? this.payload.summary_points : []
    },
    summaryTimeLabel() {
      return formatSummaryTimeLabel(this.summary, { locale: getCurrentLocale() })
    }
  }
}
</script>

<style scoped>
.message-summary-card {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  padding: 4px 0;
  max-width: 100%;
}

.summary-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(var(--theme-primary-rgb), 0.14);
  color: var(--theme-primary);
}

.summary-body {
  min-width: 0;
  flex: 1;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.summary-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.summary-delete:hover {
  background: var(--app-surface-muted);
  color: var(--app-text-strong);
}

.summary-author {
  font-weight: 700;
  font-size: 14px;
}

.summary-time {
  font-size: 12px;
  opacity: 0.5;
}

.summary-shell {
  max-width: min(760px, 100%);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(var(--theme-primary-rgb), 0.24);
  background: var(--app-primary-soft);
  box-sizing: border-box;
  overflow-wrap: anywhere;
}

.summary-shell.failed {
  border-color: rgba(229, 115, 115, 0.34);
  background: rgba(229, 115, 115, 0.08);
}

.summary-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  opacity: 0.75;
}

.summary-mini,
.summary-state {
  margin: 0;
  white-space: pre-wrap;
}

.summary-points {
  margin: 8px 0 0;
  padding-left: 18px;
}

.summary-points li + li {
  margin-top: 4px;
}

.summary-meta {
  margin-top: 10px;
  font-size: 12px;
  opacity: 0.65;
}
</style>
