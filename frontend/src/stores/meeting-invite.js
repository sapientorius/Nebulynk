import { defineStore } from 'pinia'
import api from '../lib/api.js'

export const useMeetingInviteStore = defineStore('meetingInvite', () => {
  async function loadInvite(token) {
    if (!token) throw new Error('token is required')
    const { data } = await api.get('/meeting-invite', {
      params: { token }
    })
    return data
  }

  async function acceptInvite({ token, displayName }) {
    if (!token) throw new Error('token is required')
    const { data } = await api.post('/meeting-invite', {
      token,
      display_name: displayName
    })
    return data
  }

  return {
    loadInvite,
    acceptInvite
  }
})
