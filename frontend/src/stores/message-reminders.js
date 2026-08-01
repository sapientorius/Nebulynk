import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

export const useMessageRemindersStore = defineStore('message-reminders', () => {
  const remindersByMessageId = ref({})
  const loadingByMessageId = ref({})

  function setLoading(messageId, value) {
    if (!messageId) return
    loadingByMessageId.value = {
      ...loadingByMessageId.value,
      [messageId]: Boolean(value)
    }
  }

  function setReminder(reminder) {
    if (!reminder?.message_id) return null
    remindersByMessageId.value = {
      ...remindersByMessageId.value,
      [reminder.message_id]: reminder
    }
    return reminder
  }

  function clearReminder(messageId) {
    if (!messageId) return
    const next = { ...remindersByMessageId.value }
    delete next[messageId]
    remindersByMessageId.value = next
  }

  function getActiveReminder(messageId) {
    return messageId ? remindersByMessageId.value[messageId] || null : null
  }

  async function loadActive() {
    const { data } = await api.get('/message-reminders', {
      params: {
        status: 'active'
      }
    })

    const nextReminders = {}
    for (const reminder of asList(data)) {
      if (reminder?.message_id) {
        nextReminders[reminder.message_id] = reminder
      }
    }
    remindersByMessageId.value = nextReminders

    return Object.values(nextReminders)
  }

  async function loadForMessage(messageId) {
    if (!messageId) return null
    setLoading(messageId, true)
    try {
      const { data } = await api.get('/message-reminders', {
        params: {
          message_id: messageId,
          status: 'active'
        }
      })
      const reminder = asList(data)[0] || null
      if (reminder) {
        setReminder(reminder)
      } else {
        clearReminder(messageId)
      }
      return reminder
    } finally {
      setLoading(messageId, false)
    }
  }

  async function saveReminder(messageId, remindAt) {
    if (!messageId) throw new Error('messageId is required')
    const { data } = await api.post('/message-reminders', {
      message_id: messageId,
      remind_at: remindAt
    })
    return setReminder(data)
  }

  async function rescheduleReminder(reminderId, remindAt) {
    if (!reminderId) throw new Error('reminderId is required')
    const { data } = await api.patch(`/message-reminders/${reminderId}`, {
      remind_at: remindAt
    })
    return setReminder(data)
  }

  async function removeReminder(reminder) {
    if (!reminder?.id) return null
    const { data } = await api.delete(`/message-reminders/${reminder.id}`)
    clearReminder(reminder.message_id)
    return data
  }

  async function upsertForMessage(messageId, remindAt) {
    const existing = getActiveReminder(messageId)
    if (existing?.id) {
      return rescheduleReminder(existing.id, remindAt)
    }
    return saveReminder(messageId, remindAt)
  }

  function reset() {
    remindersByMessageId.value = {}
    loadingByMessageId.value = {}
  }

  return {
    remindersByMessageId,
    loadingByMessageId,
    getActiveReminder,
    loadActive,
    loadForMessage,
    saveReminder,
    rescheduleReminder,
    removeReminder,
    upsertForMessage,
    reset
  }
})
