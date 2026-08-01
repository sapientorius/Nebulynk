import { defineStore } from 'pinia'
import api from '../lib/api.js'

export const useInviteAcceptStore = defineStore('inviteAccept', () => {
  async function loadInvite(token) {
    if (!token) throw new Error('token is required')
    const { data } = await api.get('/invite-accept', { params: { token } })
    return data
  }

  async function acceptInvite({ token, displayName, password }) {
    if (!token) throw new Error('token is required')
    const { data } = await api.post('/invite-accept', {
      token,
      display_name: displayName,
      password
    })
    return data
  }

  return {
    loadInvite,
    acceptInvite
  }
})
