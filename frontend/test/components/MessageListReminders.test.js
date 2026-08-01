import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MessageList reminder refresh', () => {
  it('loads active reminders when the message list opens and refreshes after the next due reminder', () => {
    const source = readFileSync(resolve('src/components/MessageList.vue'), 'utf8')

    expect(source).toContain('useMessageRemindersStore')
    expect(source).toContain('REMINDER_PROCESSING_BUFFER_MS = 35_000')
    expect(source).toContain('this.loadActiveReminders()')
    expect(source).toContain('await this.messageRemindersStore.loadActive()')
    expect(source).toContain('scheduleReminderRefresh()')
    expect(source).toContain('clearReminderRefreshTimer()')
  })
})
