<template>
  <n-card
    size="small"
    class="meeting-card"
    :class="{
      'meeting-card-notification': variant === 'notification',
      'meeting-card-overview': variant === 'overview',
      'meeting-card-restricted': isAccessDenied
    }"
    data-testid="meeting-card"
    :data-meeting-id="meetingId"
  >
    <n-space vertical :size="8">
      <n-space align="center" justify="space-between">
        <div class="meeting-card-heading">
          <span v-if="showLabel" class="meeting-card-label">{{ labelText }}</span>
          <span v-if="title" class="meeting-card-title">{{ title }}</span>
          <span v-if="subtitle" class="meeting-card-subtitle">{{ subtitle }}</span>
        </div>
        <n-tag
          size="small"
          :type="statusType"
          data-testid="meeting-card-status"
        >
          {{ statusLabel }}
        </n-tag>
      </n-space>

      <span class="meeting-card-connected" data-testid="meeting-card-connected">
        {{ summaryText }}
      </span>
      <n-popover v-if="miniSummary" trigger="click" placement="top-start">
        <template #trigger>
          <span
            class="meeting-card-mini-summary"
            data-testid="meeting-card-mini-summary"
            :title="miniSummary"
            role="button"
            tabindex="0"
            @click.stop
            @keydown.enter.stop.prevent="$event.currentTarget.click()"
            @keydown.space.stop.prevent="$event.currentTarget.click()"
          >
            {{ miniSummary }}
          </span>
        </template>
        <div class="meeting-card-mini-summary-popover">
          {{ miniSummary }}
        </div>
      </n-popover>

      <n-space :size="8">
        <n-button
          v-if="!isAccessDenied"
          size="small"
          tertiary
          data-testid="meeting-card-open"
          :data-meeting-id="meetingId"
          @click.stop="$emit('open')"
        >
          {{ $t('ui.components.go_to_meeting') }}
        </n-button>
        <n-button
          v-if="isJoinVisible"
          size="small"
          type="primary"
          data-testid="meeting-card-join"
          :data-meeting-id="meetingId"
          :loading="isJoining"
          :disabled="isJoinDisabled"
          @click.stop="$emit('join')"
        >
          {{ $t('ui.components.join_call') }}
        </n-button>
      </n-space>
    </n-space>
  </n-card>
</template>

<script>
export default {
  name: 'MeetingActionCard',
  emits: ['open', 'join'],
  props: {
    meetingId: {
      type: String,
      default: null
    },
    title: {
      type: String,
      default: null
    },
    subtitle: {
      type: String,
      default: null
    },
    statusLabel: {
      type: String,
      required: true
    },
    statusType: {
      type: String,
      default: 'default'
    },
    summaryText: {
      type: String,
      required: true
    },
    miniSummary: {
      type: String,
      default: null
    },
    isJoinVisible: {
      type: Boolean,
      default: false
    },
    isJoinDisabled: {
      type: Boolean,
      default: false
    },
    isJoining: {
      type: Boolean,
      default: false
    },
    isAccessDenied: {
      type: Boolean,
      default: false
    },
    showLabel: {
      type: Boolean,
      default: true
    },
    label: {
      type: String,
      default: null
    },
    variant: {
      type: String,
      default: 'default'
    }
  },
  computed: {
    labelText() {
      return this.label || this.$t('ui.components.meeting_card')
    }
  }
}
</script>

<style scoped>
.meeting-card {
  max-width: 520px;
  background: rgba(99, 226, 183, 0.05);
  border: 1px solid rgba(99, 226, 183, 0.35);
}

.meeting-card-notification {
  max-width: none;
}

.meeting-card-overview {
  max-width: none;
  height: 100%;
}

.meeting-card-restricted {
  border-color: rgba(240, 160, 32, 0.45);
  background: rgba(240, 160, 32, 0.06);
}

.meeting-card-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.meeting-card-label {
  font-weight: 600;
}

.meeting-card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meeting-card-subtitle {
  font-size: 12px;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meeting-card-connected {
  font-size: 13px;
  opacity: 0.8;
}

.meeting-card-mini-summary {
  display: -webkit-box;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  cursor: pointer;
}

.meeting-card-mini-summary-popover {
  max-width: min(360px, 70vw);
  white-space: pre-wrap;
  line-height: 1.45;
}
</style>
