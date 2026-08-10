<template>
  <div class="meeting-history-access-select" data-testid="meeting-history-access-select">
    <n-radio-group :value="modelValue" @update:value="$emit('update:modelValue', $event)">
      <div class="meeting-history-access-options">
        <label
          v-for="option in options"
          :key="option.value"
          class="meeting-history-access-option"
          :data-testid="`meeting-history-access-${option.value}`"
        >
          <n-radio :value="option.value">
            <span class="meeting-history-access-label">{{ option.label }}</span>
          </n-radio>
          <span class="meeting-history-access-description">{{ option.description }}</span>
        </label>
      </div>
    </n-radio-group>
    <span class="meeting-history-access-retention">
      {{ $t('meetingHistoryAccess.active_participant_retention') }}
    </span>
  </div>
</template>

<script>
import {
  DEFAULT_MEETING_HISTORY_ACCESS,
  getMeetingHistoryAccessOptions
} from '../lib/meeting-history-access.js'

export default {
  name: 'MeetingHistoryAccessSelect',
  emits: ['update:modelValue'],
  props: {
    modelValue: {
      type: String,
      default: DEFAULT_MEETING_HISTORY_ACCESS
    }
  },
  computed: {
    options() {
      return getMeetingHistoryAccessOptions(this.$t)
    }
  }
}
</script>

<style scoped>
.meeting-history-access-select,
.meeting-history-access-options {
  display: grid;
  gap: 10px;
  width: 100%;
}

.meeting-history-access-option {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  cursor: pointer;
}

.meeting-history-access-label {
  font-weight: 600;
}

.meeting-history-access-description,
.meeting-history-access-retention {
  padding-left: 24px;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.72;
}

.meeting-history-access-retention {
  padding-left: 0;
}
</style>
