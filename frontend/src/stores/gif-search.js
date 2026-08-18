import { ref } from 'vue'
import { defineStore } from 'pinia'
import api, { getPlatformStatus } from '../lib/api.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

export const useGifSearchStore = defineStore('gifSearch', () => {
  const klipyConfigured = ref(false)

  async function loadConfiguration(options = {}) {
    const status = await getPlatformStatus(options)
    klipyConfigured.value = status?.klipy_configured === true || status?.klipy_configured === 'true'
    return klipyConfigured.value
  }

  async function loadTrending(limit = 20) {
    const { data } = await api.get('/gifs', { params: { limit } })
    return asList(data)
  }

  async function searchGifs(query, limit = 20) {
    const { data } = await api.get('/gifs', {
      params: { q: query, limit }
    })
    return asList(data)
  }

  return {
    klipyConfigured,
    loadConfiguration,
    loadTrending,
    searchGifs
  }
})
