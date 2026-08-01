import { defineStore } from 'pinia'
import api from '../lib/api.js'

export const useChannelMembersStore = defineStore('channelMembers', () => {
  async function addMember({ channelId, userId }) {
    if (!channelId) throw new Error('channelId is required')
    if (!userId) throw new Error('userId is required')
    const { data } = await api.post('/channel-members', {
      channel_id: channelId,
      user_id: userId
    })
    return data
  }

  async function removeMember(memberId) {
    if (!memberId) throw new Error('memberId is required')
    return api.delete(`/channel-members/${memberId}`)
  }

  return {
    addMember,
    removeMember
  }
})
