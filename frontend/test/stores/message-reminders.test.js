import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('message reminders store', () => {
  it('uses the message-reminders service for summary load, status load, upsert, reschedule, and cancel', () => {
    const source = readFileSync(resolve('src/stores/message-reminders.js'), 'utf8')

    expect(source).toContain("api.get('/message-reminders'")
    expect(source).toContain('async function loadActive()')
    expect(source).toContain("message_id: messageId")
    expect(source).toContain("status: 'active'")
    expect(source).toContain('const nextReminders = {}')
    expect(source).toContain('nextReminders[reminder.message_id] = reminder')
    expect(source).toContain('remindersByMessageId.value = nextReminders')
    expect(source).toContain("api.post('/message-reminders'")
    expect(source).toContain("api.patch(`/message-reminders/${reminderId}`")
    expect(source).toContain("api.delete(`/message-reminders/${reminder.id}`")
    expect(source).toContain('upsertForMessage')
    expect(source).toContain('loadActive,')
  })
})
