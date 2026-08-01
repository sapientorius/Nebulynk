import { defineStore } from 'pinia'
import api from '../lib/api.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

export const useGifSearchStore = defineStore('gifSearch', () => {
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
    loadTrending,
    searchGifs
  }
})
