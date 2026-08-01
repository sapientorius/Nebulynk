import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageReminderIndicator', () => {
  it('shows a private, accessible alarm indicator only when a reminder is active', () => {
    const source = readFileSync(resolve('src/components/MessageReminderIndicator.vue'), 'utf8')

    expect(source).toContain('AlarmOutline as AlarmIcon')
    expect(source).toContain('v-if="activeReminder"')
    expect(source).toContain('data-testid="message-reminder-indicator"')
    expect(source).toContain(':aria-label="reminderMessage"')
    expect(source).toContain('this.messageRemindersStore.getActiveReminder(this.messageId)')
  })

  it('uses a tooltip and popover with localized timing and a remove action', () => {
    const source = readFileSync(resolve('src/components/MessageReminderIndicator.vue'), 'utf8')

    expect(source).toContain('<n-tooltip v-if="activeReminder" trigger="hover">')
    expect(source).toContain('<n-popover')
    expect(source).toContain('data-testid="message-reminder-indicator-popover"')
    expect(source).toContain('data-testid="message-reminder-indicator-remove"')
    expect(source).toContain("this.$t('ui.components.reminder_message_scheduled'")
    expect(source).toContain("$t('ui.components.reminder_remove')")
    expect(source).toContain('getCurrentLocale()')
    expect(source).toContain('toLocaleDateString(locale')
    expect(source).toContain('toLocaleTimeString(locale')
  })

  it('removes through the existing store and refreshes stale reminder state', () => {
    const source = readFileSync(resolve('src/components/MessageReminderIndicator.vue'), 'utf8')

    expect(source).toContain('await this.messageRemindersStore.removeReminder(reminder)')
    expect(source).toContain('this.messageRemindersStore.loadForMessage(this.messageId)')
    expect(source).toContain("this.$t('ui.components.reminder_removed')")
    expect(source).toContain("this.$t('ui.components.reminder_remove_failed')")
  })
})
