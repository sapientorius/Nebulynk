<template>
  <div class="reminder-menu" data-testid="message-reminder-menu">
    <div v-if="showTitle" class="reminder-menu-title">{{ $t('ui.components.remind') }}</div>
    <div v-if="activeReminder" class="reminder-current">
      {{ $t('ui.components.reminder_set_for', { time: formatReminderTime(activeReminder.remind_at) }) }}
    </div>
    <div class="reminder-quick-grid">
      <button
        v-for="option in reminderOptions"
        :key="option.key"
        class="reminder-option"
        type="button"
        :data-testid="`message-reminder-option-${option.key}`"
        :disabled="loading"
        @click="$emit('quick-select', option.ms)"
      >
        {{ $t(option.labelKey) }}
      </button>
    </div>
    <n-date-picker
      :value="customReminderAt"
      :to="datePickerTo"
      type="datetime"
      class="reminder-date-picker"
      :placeholder="$t('ui.components.reminder_custom')"
      :is-date-disabled="disablePastReminderDate"
      clearable
      @update:value="$emit('update:customReminderAt', $event)"
    />
    <n-space justify="space-between" align="center" :wrap="false">
      <n-button
        size="small"
        type="primary"
        :loading="loading"
        :disabled="!customReminderAt"
        data-testid="message-reminder-custom-save"
        @click="$emit('save')"
      >
        {{ $t('ui.components.reminder_save') }}
      </n-button>
      <n-button
        v-if="activeReminder"
        size="small"
        quaternary
        type="error"
        :loading="loading"
        data-testid="message-reminder-remove"
        @click="$emit('remove')"
      >
        {{ $t('ui.components.remove') }}
      </n-button>
    </n-space>
  </div>
</template>

<script>
export default {
  name: 'MessageReminderMenu',
  props: {
    activeReminder: { type: Object, default: null },
    reminderOptions: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    customReminderAt: { type: Number, default: null },
    datePickerTo: { type: [String, Boolean, Object], default: undefined },
    showTitle: { type: Boolean, default: true }
  },
  emits: ['update:customReminderAt', 'quick-select', 'save', 'remove'],
  methods: {
    formatReminderTime(value) {
      if (!value) return ''
      return new Date(value).toLocaleString()
    },
    disablePastReminderDate(timestamp) {
      return timestamp < Date.now() - 86_400_000
    }
  }
}
</script>

<style scoped>
.reminder-menu {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 280px;
  color: var(--app-text);
}

.reminder-menu-title {
  font-size: 14px;
  font-weight: 600;
}

.reminder-current {
  padding: 8px 10px;
  border: 1px solid var(--app-border-soft);
  border-radius: 6px;
  background: var(--app-surface-muted);
  color: var(--app-text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.reminder-quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.reminder-option {
  min-height: 34px;
  border: 1px solid var(--app-border-soft);
  border-radius: 6px;
  background: var(--app-surface-muted);
  color: var(--app-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.reminder-option:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-strong);
}

.reminder-option:disabled {
  cursor: wait;
  opacity: 0.55;
}

.reminder-date-picker {
  width: 100%;
}
</style>
