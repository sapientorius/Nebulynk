import { defineStore } from 'pinia'
import api from '../lib/api.js'

export const useMessageOpsStore = defineStore('messageOps', () => {
  async function editMessage(messageId, content) {
    if (!messageId) throw new Error('messageId is required')
    return api.patch(`/messages/${messageId}`, { content })
  }

  async function deleteMessage(messageId) {
    if (!messageId) throw new Error('messageId is required')
    return api.delete(`/messages/${messageId}`)
  }

  async function addReaction(messageId, emoji) {
    if (!messageId) throw new Error('messageId is required')
    if (!emoji) throw new Error('emoji is required')
    return api.post('/reactions', { message_id: messageId, emoji })
  }

  async function removeReaction(reactionId) {
    if (!reactionId) throw new Error('reactionId is required')
    return api.delete(`/reactions/${reactionId}`)
  }

  async function toggleReaction({ message, currentUserId, emoji }) {
    if (!message?.id) throw new Error('message.id is required')
    if (!emoji) throw new Error('emoji is required')

    const group = (message.reactions || []).find((entry) => entry.emoji === emoji)
    const own = group?.users?.find((entry) => entry.user_id === currentUserId)
    if (own?.id) {
      return removeReaction(own.id)
    }

    return addReaction(message.id, emoji)
  }

  return {
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    toggleReaction
  }
})
