import { ref } from 'vue'
import { defineStore } from 'pinia'
import api from '../lib/api.js'

function asList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.data || []
}

export const useVideoBackgroundsStore = defineStore('videoBackgrounds', () => {
  const backgrounds = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const generating = ref(false)
  const imageGenerationAvailable = ref(false)
  const objectUrls = ref({})

  function revokeObjectUrl(id) {
    const current = objectUrls.value[id]
    if (current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(current)
    }
    const next = { ...objectUrls.value }
    delete next[id]
    objectUrls.value = next
  }

  async function loadBackgrounds(options = {}) {
    loading.value = true
    try {
      const { data } = await api.get('/video-backgrounds', { params: options })
      backgrounds.value = asList(data)
      imageGenerationAvailable.value = data?.image_generation_available === true
      return backgrounds.value
    } finally {
      loading.value = false
    }
  }

  async function ensureObjectUrl(background) {
    if (!background?.id) return null
    if (objectUrls.value[background.id]) return objectUrls.value[background.id]
    const response = await api.get(`/video-backgrounds/${background.id}/content`, {
      responseType: 'blob'
    })
    const url = URL.createObjectURL(response.data)
    objectUrls.value = { ...objectUrls.value, [background.id]: url }
    return url
  }

  async function uploadBackground(file, title = null) {
    saving.value = true
    try {
      const form = new FormData()
      form.append('file', file)
      if (title) form.append('title', title)
      const { data } = await api.post('/video-backgrounds/upload', form)
      await loadBackgrounds()
      return data
    } finally {
      saving.value = false
    }
  }

  async function generateBackground(prompt, title = null) {
    generating.value = true
    try {
      const { data } = await api.post('/video-backgrounds', { prompt, title })
      await loadBackgrounds()
      return data
    } finally {
      generating.value = false
    }
  }

  async function updateBackground(id, patch) {
    saving.value = true
    try {
      const { data } = await api.patch(`/video-backgrounds/${id}`, patch)
      backgrounds.value = backgrounds.value.map((entry) => (entry.id === id ? data : entry))
      revokeObjectUrl(id)
      return data
    } finally {
      saving.value = false
    }
  }

  async function deleteBackground(id) {
    saving.value = true
    try {
      await api.delete(`/video-backgrounds/${id}`)
      backgrounds.value = backgrounds.value.filter((entry) => entry.id !== id)
      revokeObjectUrl(id)
    } finally {
      saving.value = false
    }
  }

  function disposeObjectUrls() {
    for (const id of Object.keys(objectUrls.value)) {
      revokeObjectUrl(id)
    }
  }

  return {
    backgrounds,
    loading,
    saving,
    generating,
    imageGenerationAvailable,
    objectUrls,
    loadBackgrounds,
    ensureObjectUrl,
    uploadBackground,
    generateBackground,
    updateBackground,
    deleteBackground,
    disposeObjectUrls
  }
})
