<template>
  <n-tooltip v-if="activeReminder" trigger="hover">
    <template #trigger>
      <span class="message-reminder-indicator">
        <n-popover
          v-model:show="showPopover"
          trigger="click"
          placement="top-start"
          :show-arrow="false"
        >
          <template #trigger>
            <button
              class="message-reminder-indicator-button"
              type="button"
              :title="reminderMessage"
              :aria-label="reminderMessage"
              data-testid="message-reminder-indicator"
            >
              <n-icon size="16"><alarm-icon /></n-icon>
            </button>
          </template>
          <div class="message-reminder-popover" data-testid="message-reminder-indicator-popover">
            <p>{{ reminderMessage }}</p>
            <n-button
              size="small"
              type="error"
              :loading="removing"
              data-testid="message-reminder-indicator-remove"
              @click="removeReminder"
            >
              {{ $t('ui.components.reminder_remove') }}
            </n-button>
          </div>
        </n-popover>
      </span>
    </template>
    {{ reminderMessage }}
  </n-tooltip>
</template>

<script>
import { AlarmOutline as AlarmIcon } from '@vicons/ionicons5'
import { useMessageRemindersStore } from '../stores/index.js'
import { getCurrentLocale } from '../lib/i18n.js'

export default {
  name: 'MessageReminderIndicator',
  components: { AlarmIcon },
  props: {
    messageId: { type: String, required: true }
  },
  data() {
    return {
      showPopover: false,
      removing: false
    }
  },
  computed: {
    messageRemindersStore() {
      return useMessageRemindersStore()
    },
    activeReminder() {
      return this.messageRemindersStore.getActiveReminder(this.messageId)
    },
    reminderMessage() {
      if (!this.activeReminder?.remind_at) return ''
      const date = new Date(this.activeReminder.remind_at)
      if (!Number.isFinite(date.getTime())) return ''

      const locale = getCurrentLocale()
      return this.$t('ui.components.reminder_message_scheduled', {
        date: date.toLocaleDateString(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        time: date.toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit'
        })
      })
    }
  },
  methods: {
    async removeReminder() {
      const reminder = this.activeReminder
      if (!reminder || this.removing) return

      this.removing = true
      try {
        await this.messageRemindersStore.removeReminder(reminder)
        this.showPopover = false
        window.$message?.success(this.$t('ui.components.reminder_removed'))
      } catch (error) {
        const latestReminder = await this.messageRemindersStore.loadForMessage(this.messageId).catch(() => reminder)
        if (latestReminder) {
          window.$message?.error(this.$t('ui.components.reminder_remove_failed'))
        }
      } finally {
        this.removing = false
      }
    }
  }
}
</script>

<style scoped>
.message-reminder-indicator {
  display: inline-flex;
  align-items: center;
}

.message-reminder-indicator-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--theme-primary);
  cursor: pointer;
}

.message-reminder-indicator-button:hover {
  background: var(--app-hover);
}

.message-reminder-indicator-button:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

.message-reminder-popover {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: min(280px, calc(100vw - 32px));
  color: var(--app-text);
}

.message-reminder-popover p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
</style>
